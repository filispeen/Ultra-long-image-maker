const zipInput = document.getElementById("zipInput");
const processBtn = document.getElementById("processBtn");
const buttonText = document.getElementById("buttonText");
const resultDiv = document.getElementById("result");
const uploadArea = document.getElementById("uploadArea");
const progressBar = document.getElementById("progressBar");
const progressFill = document.getElementById("progressFill");
const qualitySlider = document.getElementById("qualitySlider");
const qualityValue = document.getElementById("qualityValue");
const presetBtns = document.querySelectorAll(".preset-btn");

let isProcessing = false;
let imageQuality = 0.92; // Default quality

function download(file) {
  let element = document.createElement("a");
  element.setAttribute("href", encodeURIComponent(file));
  element.setAttribute("download", file);
  document.body.appendChild(element);
  element.click();

  document.body.removeChild(element);
}

document.getElementById("exampleDownloadBtn").addEventListener(
  "click",
  function () {
    let filename = "example.zip";
    download(filename);
  },
  false
);

// Quality control
qualitySlider.addEventListener("input", (e) => {
  const value = parseInt(e.target.value);
  imageQuality = value / 100;
  qualityValue.textContent = `${value}%`;

  // Update active preset button
  presetBtns.forEach((btn) => {
    btn.classList.remove("active");
    if (parseInt(btn.dataset.quality) === value) {
      btn.classList.add("active");
    }
  });
});

// Drag and drop functionality
uploadArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadArea.classList.add("dragover");
});

uploadArea.addEventListener("dragleave", () => {
  uploadArea.classList.remove("dragover");
});

uploadArea.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadArea.classList.remove("dragover");
  const files = e.dataTransfer.files;
  if (files.length && files[0].name.endsWith(".zip")) {
    zipInput.files = files;
    updateButtonState();
  }
});

zipInput.addEventListener("change", (e) => {
  updateButtonState();
  const fileName = e.target.files[0]?.name;
  if (fileName) {
    document.querySelector(
      ".upload-text"
    ).textContent = `Uploaded file: ${fileName}`;
  }
});

function updateButtonState() {
  if (zipInput.files.length && !isProcessing) {
    processBtn.disabled = false;
    buttonText.textContent = "Process images";
  }
}

function updateProgress(percent) {
  progressFill.style.width = `${percent}%`;
}

async function cropImageTo5Horizontal(finalCanvas, resultDiv) {
  const jszip = new JSZip();
  const width = finalCanvas.width;
  const height = finalCanvas.height;
  const partWidth = Math.floor(width / 5);
  updateProgress(60);
  for (let i = 1; i <= 5; i++) {
    const left = (i - 1) * partWidth;
    const right = i === 5 ? width : i * partWidth;
    const currentWidth = right - left;
    const croppedCanvas = document.createElement("canvas");
    croppedCanvas.width = currentWidth;
    croppedCanvas.height = height;
    const ctx = croppedCanvas.getContext("2d");
    ctx.drawImage(
      finalCanvas,
      left,
      0,
      currentWidth,
      height,
      0,
      0,
      currentWidth,
      height
    );
    const resizedCanvas = document.createElement("canvas");
    const targetWidth = 152;
    const targetHeight = height;
    resizedCanvas.width = targetWidth;
    resizedCanvas.height = targetHeight;
    const rctx = resizedCanvas.getContext("2d");
    rctx.imageSmoothingEnabled = true;
    rctx.imageSmoothingQuality = "high";
    rctx.drawImage(croppedCanvas, 0, 0, targetWidth, targetHeight);
    const blob2 = await new Promise((resolve) =>
      resizedCanvas.toBlob(resolve, "image/jpeg", imageQuality)
    );
    const arrayBuffer = await blob2.arrayBuffer();
    jszip.file(`part${i}.jpg`, arrayBuffer);
    updateProgress(60 + (i / 5) * 30);
  }
  const zipBlob = await jszip.generateAsync({ type: "blob" });
  const url2 = URL.createObjectURL(zipBlob);
  finalCanvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    resultDiv.innerHTML = `<a href="${url}" download="combined.png" class="download-link">Download combined images</a>`;
    resultDiv.innerHTML += `<a href="${url2}" download="cropped_parts.zip" class="download-link">Download cropped images</a>`;
    resultDiv.appendChild(finalCanvas);
    updateProgress(100);
    processBtn.disabled = false;
    buttonText.textContent = "Process images";
  });
}

async function processZip(file) {
  const jszip = new JSZip();

  isProcessing = true;
  processBtn.disabled = true;
  buttonText.innerHTML =
    '<div class="processing"><div class="spinner"></div>Process...</div>';
  progressBar.style.display = "block";
  resultDiv.innerHTML = "";

  updateProgress(10);
  try {
    const zip = await jszip.loadAsync(file);
    const images = [];
    updateProgress(20);
    const imageFiles = Object.entries(zip.files).filter(
      ([filename, entry]) => !entry.dir && /\.(png|jpe?g|webp)$/i.test(filename)
    );

    if (!imageFiles.length) {
      throw new Error("No images found in the ZIP file.");
    }

    for (let i = 0; i < imageFiles.length; i++) {
      const [filename, entry] = imageFiles[i];
      const blob = await entry.async("blob");
      const img = await createImageBitmap(blob);
      images.push(img);
      updateProgress(20 + (i / imageFiles.length) * 30);
    }
    updateProgress(50);
    const widths = images.map((img) => img.width);
    const mostCommonWidth = widths
      .sort(
        (a, b) =>
          widths.filter((v) => v === a).length -
          widths.filter((v) => v === b).length
      )
      .pop();

    let targetWidth = mostCommonWidth;
    const resized = images.map((img) => {
      const canvas = document.createElement("canvas");
      const scale = mostCommonWidth / img.width;
      canvas.width = mostCommonWidth;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas;
    });

    let totalHeight = resized.reduce((acc, c) => acc + c.height, 0);
    let scaleFactor = 1;
    if (totalHeight > 65000) {
      scaleFactor = 65000 / totalHeight;
      totalHeight = 65000;
    }
    targetWidth = Math.round(targetWidth * scaleFactor);

    const finalCanvas = document.createElement("canvas");
    finalCanvas.width = mostCommonWidth * scaleFactor;
    finalCanvas.height = totalHeight;
    const ctx = finalCanvas.getContext("2d");
    let y = 0;
    for (const c of resized) {
      const h = c.height * scaleFactor;
      const w = c.width * scaleFactor;
      ctx.drawImage(c, 0, y, w, h);
      y += h;
    }

    updateProgress(55);
    await cropImageTo5Horizontal(finalCanvas, resultDiv);
  } catch (error) {
    resultDiv.innerHTML = `<p style="color: #ef4444; font-weight: 600;">Ошибка: ${error.message}</p>`;
    updateProgress(0);
  } finally {
    isProcessing = false;
    setTimeout(() => {
      progressBar.style.display = "none";
      updateProgress(0);
    }, 2000);
  }
}

processBtn.addEventListener("click", () => {
  if (zipInput.files.length && !isProcessing) {
    processZip(zipInput.files[0]);
  }
});
