const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const state = {
  images: [],
  uploadInProgress: false,
  progressIntervalId: null,
};

const elements = {
  form: document.getElementById("uploadForm"),
  dropZone: document.getElementById("dropZone"),
  imageInput: document.getElementById("imageInput"),
  previewGrid: document.getElementById("previewGrid"),
  emptyState: document.getElementById("emptyState"),
  selectionCount: document.getElementById("selectionCount"),
  clearAllBtn: document.getElementById("clearAllBtn"),
  submitBtn: document.getElementById("submitBtn"),
  uploadError: document.getElementById("uploadError"),
  uploadResponse: document.getElementById("uploadResponse"),
  progressBar: document.getElementById("progressBar"),
  progressText: document.getElementById("progressText"),
  loadingSpinner: document.getElementById("loadingSpinner"),
  imageModal: document.getElementById("imageModal"),
  modalImage: document.getElementById("modalImage"),
  modalCaption: document.getElementById("modalCaption"),
  modalCloseBtn: document.getElementById("modalCloseBtn"),
};

elements.imageInput.setAttribute("aria-label", "Choose image files to upload");

function formatBytes(bytes) {
  if (bytes === 0) {
    return "0 Bytes";
  }

  const units = ["Bytes", "KB", "MB", "GB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** unitIndex;

  return `${value.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

function escapeHtml(value) {
  const stringValue = String(value);
  const entityMap = {
    "&": "&",
    "<": "<",
    ">": ">",
    '"': """,
    "'": "&#039;",
  };

  return stringValue.replace(/[&<>"']/g, function(character) {
    return entityMap[character];
  });
}

function getFileSignature(file) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function generateId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `image-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function resetMessages() {
  elements.uploadError.textContent = "";
  elements.uploadResponse.textContent = "";
  elements.uploadResponse.classList.remove("is-error");
}

function showError(message) {
  elements.uploadError.textContent = message;
}

function showResponse(message, isError = false) {
  elements.uploadResponse.textContent = message;
  elements.uploadResponse.classList.toggle("is-error", isError);
}

function updateActionButtons() {
  const hasImages = state.images.length > 0;
  elements.clearAllBtn.disabled = !hasImages || state.uploadInProgress;
  elements.submitBtn.disabled = !hasImages || state.uploadInProgress;
  elements.selectionCount.textContent = `${state.images.length} image${state.images.length === 1 ? "" : "s"} selected`;
}

function updateEmptyState() {
  elements.emptyState.hidden = state.images.length > 0;
}

function resetProgress() {
  elements.progressBar.style.width = "0%";
  elements.progressText.textContent = "0%";
}

function setUploadingState(isUploading) {
  state.uploadInProgress = isUploading;
  elements.submitBtn.classList.toggle("is-loading", isUploading);
  elements.submitBtn.disabled = isUploading || state.images.length === 0;
  elements.clearAllBtn.disabled = isUploading || state.images.length === 0;
  elements.imageInput.disabled = isUploading;
}

function openModal(image) {
  elements.modalImage.src = image.dataUrl;
  elements.modalImage.alt = image.name;
  elements.modalCaption.textContent = `${image.name} • ${formatBytes(image.size)}`;
  elements.imageModal.classList.add("is-open");
  elements.imageModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  elements.imageModal.classList.remove("is-open");
  elements.imageModal.setAttribute("aria-hidden", "true");
  elements.modalImage.src = "";
  elements.modalCaption.textContent = "";
  document.body.style.overflow = "";
}

function renderPreviews() {
  elements.previewGrid.innerHTML = state.images
    .map((image) => {
      const safeName = escapeHtml(image.name);
      const safeSize = escapeHtml(formatBytes(image.size));
      const safeType = escapeHtml(image.type.toUpperCase());

      return `
        <article class="preview-card">
          <button
            type="button"
            class="remove-btn"
            data-remove-id="${image.id}"
            aria-label="Remove ${safeName}"
            title="Remove image"
          >
            &times;
          </button>
          <button
            type="button"
            class="preview-image-btn"
            data-preview-id="${image.id}"
            aria-label="Open ${safeName} in full screen preview"
            title="Open full preview"
          >
            <div class="preview-media">
              <img src="${image.dataUrl}" alt="${safeName}" loading="lazy" />
            </div>
            <div class="preview-body">
              <p class="preview-name">${safeName}</p>
              <div class="preview-meta">
                <span>${safeSize}</span>
                <span>${safeType}</span>
              </div>
            </div>
          </button>
        </article>
      `;
    })
    .join("");

  updateEmptyState();
  updateActionButtons();
}

function removeImageById(imageId) {
  state.images = state.images.filter((image) => image.id !== imageId);
  renderPreviews();
  resetMessages();
}

function clearAllImages() {
  state.images = [];
  elements.imageInput.value = "";
  renderPreviews();
  resetMessages();
  resetProgress();
}

function validateFile(file) {
  if (!ALLOWED_TYPES.has(file.type)) {
    return `${file.name} is not a supported format. Use JPG, JPEG, PNG, or WEBP.`;
  }

  if (file.size > MAX_FILE_SIZE) {
    return `${file.name} exceeds the 5MB limit.`;
  }

  const duplicate = state.images.some((image) => image.signature === getFileSignature(file));
  if (duplicate) {
    return `${file.name} is already selected. Duplicate uploads are not allowed.`;
  }

  return "";
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(String(reader.result));
    };

    reader.onerror = () => {
      reject(new Error(`Failed to read ${file.name}.`));
    };

    reader.readAsDataURL(file);
  });
}

async function handleFiles(fileList) {
  resetMessages();

  const files = Array.from(fileList);
  if (files.length === 0) {
    return;
  }

  const errors = [];
  const validFiles = [];

  files.forEach((file) => {
    const error = validateFile(file);
    if (error) {
      errors.push(error);
    } else {
      validFiles.push(file);
    }
  });

  for (const file of validFiles) {
    try {
      const dataUrl = await readFileAsDataUrl(file);
      state.images.push({
        id: generateId(),
        signature: getFileSignature(file),
        name: file.name,
        size: file.size,
        type: file.type,
        file,
        dataUrl,
      });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `Failed to read ${file.name}.`);
    }
  }

  renderPreviews();
  elements.imageInput.value = "";

  if (errors.length > 0) {
    showError(errors.join(" "));
  }
}

function simulateProgress() {
  clearInterval(state.progressIntervalId);

  let currentProgress = 0;
  elements.progressBar.style.width = "0%";
  elements.progressText.textContent = "0%";

  state.progressIntervalId = window.setInterval(() => {
    currentProgress = Math.min(currentProgress + Math.floor(Math.random() * 18) + 8, 92);
    elements.progressBar.style.width = `${currentProgress}%`;
    elements.progressText.textContent = `${currentProgress}%`;
  }, 220);
}

async function mockUploadRequest(formData) {
  simulateProgress();

  await new Promise((resolve) => {
    window.setTimeout(resolve, 1800);
  });

  const response = await fetch("https://jsonplaceholder.typicode.com/posts", {
    method: "POST",
    body: formData,
  });

  clearInterval(state.progressIntervalId);

  elements.progressBar.style.width = "100%";
  elements.progressText.textContent = "100%";

  if (!response.ok) {
    throw new Error("Upload failed. The server returned an unexpected response.");
  }

  return response.json();
}

async function handleSubmit(event) {
  event.preventDefault();
  resetMessages();

  if (state.images.length === 0 || state.uploadInProgress) {
    return;
  }

  const formData = new FormData();
  state.images.forEach((image, index) => {
    formData.append("images", image.file, image.name);
    formData.append(
      `metadata_${index}`,
      JSON.stringify({
        name: image.name,
        size: image.size,
        type: image.type,
      })
    );
  });

  try {
    setUploadingState(true);
    const result = await mockUploadRequest(formData);
    showResponse(`Upload completed successfully. Server response ID: ${result.id ?? "N/A"}.`);
  } catch (error) {
    showResponse(error instanceof Error ? error.message : "Something went wrong during upload.", true);
  } finally {
    setUploadingState(false);
  }
}

function handleDropZoneClick(event) {
  if (event.target === elements.dropZone) {
    elements.imageInput.click();
  }
}

function handleDropZoneKeydown(event) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    elements.imageInput.click();
  }
}

function handlePreviewGridClick(event) {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const removeButton = target.closest("[data-remove-id]");
  if (removeButton) {
    removeImageById(removeButton.getAttribute("data-remove-id"));
    return;
  }

  const previewButton = target.closest("[data-preview-id]");
  if (previewButton) {
    const previewId = previewButton.getAttribute("data-preview-id");
    const image = state.images.find((item) => item.id === previewId);
    if (image) {
      openModal(image);
    }
  }
}

function setupDragAndDrop() {
  ["dragenter", "dragover"].forEach((eventName) => {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      elements.dropZone.classList.add("is-dragover");
    });
  });

  ["dragleave", "dragend", "drop"].forEach((eventName) => {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      elements.dropZone.classList.remove("is-dragover");
    });
  });

  elements.dropZone.addEventListener("drop", (event) => {
    const files = event.dataTransfer ? event.dataTransfer.files : null;
    if (files) {
      void handleFiles(files);
    }
  });
}

function setupModalCloseActions() {
  elements.modalCloseBtn.addEventListener("click", closeModal);
  elements.imageModal.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.dataset.closeModal === "true") {
      closeModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && elements.imageModal.classList.contains("is-open")) {
      closeModal();
    }
  });
}

function initializeUploader() {
  renderPreviews();
  resetProgress();
  setupDragAndDrop();
  setupModalCloseActions();

  elements.imageInput.addEventListener("change", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.files) {
      void handleFiles(target.files);
    }
  });

  elements.form.addEventListener("submit", (event) => {
    void handleSubmit(event);
  });

  elements.clearAllBtn.addEventListener("click", clearAllImages);
  elements.dropZone.addEventListener("click", handleDropZoneClick);
  elements.dropZone.addEventListener("keydown", handleDropZoneKeydown);
  elements.previewGrid.addEventListener("click", handlePreviewGridClick);
}

initializeUploader();
fetch('http://127.0.0.1:5000/api/data')
  .then(response => response.json())
  .then(data => {
    console.log(data.message);
    document.getElementById("output").innerText = data.message;
  });
fetch('http://127.0.0.1:5000/api/data', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name: "Prithish" })
})
.then(response => response.json())
.then(data => {
    console.log(data.reply);
});
function sendData() {
    fetch('http://127.0.0.1:5000/api/data', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: "Prithish" })
    })
    .then(response => response.json())
    .then(data => {
        document.getElementById("output").innerText = data.reply;
    });
}