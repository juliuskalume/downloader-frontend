const API_BASE = "https://sentirax-downloader-backend.onrender.com";
const INFO_ENDPOINT = `${API_BASE}/api/info`;
const DOWNLOAD_ENDPOINT = `${API_BASE}/api/download`;
const RESULT_STORAGE_KEY = "sentirax_result";

function sanitizeFilename(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
}

function guessExtension(link, mediaType) {
  const match = link.match(/\.(mp4|mov|webm|mp3|m4a|wav|jpg|jpeg|png|webp)(?:\?|#|$)/i);
  if (match) {
    return `.${match[1].toLowerCase()}`;
  }

  if (mediaType === "video") return ".mp4";
  if (mediaType === "audio") return ".mp3";
  if (mediaType === "image") return ".jpg";

  return ".bin";
}

function isYouTubeUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.hostname.includes("youtube.com") || url.hostname.includes("youtu.be");
  } catch (error) {
    return false;
  }
}

function extractYouTubeId(value) {
  try {
    const url = new URL(value);
    if (url.hostname.includes("youtu.be")) {
      return url.pathname.replace("/", "");
    }
    if (url.searchParams.get("v")) {
      return url.searchParams.get("v");
    }
    if (url.pathname.includes("/shorts/")) {
      return url.pathname.split("/shorts/")[1].split("/")[0];
    }
    if (url.pathname.includes("/embed/")) {
      return url.pathname.split("/embed/")[1].split("/")[0];
    }
  } catch (error) {
    return "";
  }
  return "";
}

function buildDownloadUrl(mediaUrl, filename) {
  const url = new URL(DOWNLOAD_ENDPOINT);
  url.searchParams.set("url", mediaUrl);
  url.searchParams.set("filename", filename);
  return url.toString();
}

function triggerDownload(mediaUrl, filename) {
  const downloadUrl = buildDownloadUrl(mediaUrl, filename);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function isValidUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (error) {
    return false;
  }
}

async function fetchInfo(url) {
  const response = await fetch(INFO_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, db_cache: false }),
  });

  const raw = await response.text();
  let data;

  try {
    data = JSON.parse(raw);
  } catch (error) {
    data = { error: raw };
  }

  if (!response.ok) {
    const message = data && (data.detail || data.message || data.error);
    throw new Error(message || response.statusText || "Request failed");
  }

  return data;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "";
  const total = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (value) => String(value).padStart(2, "0");
  if (hrs > 0) {
    return `${hrs}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

function attachDownload(button, mediaUrl, filename) {
  if (!button || !mediaUrl) {
    if (button) {
      button.disabled = true;
      button.classList.add("opacity-50", "cursor-not-allowed");
    }
    return;
  }

  button.addEventListener("click", (event) => {
    event.preventDefault();
    triggerDownload(mediaUrl, filename);
  });
}

function openPreviewModal(contentEl) {
  const modal = document.getElementById("preview-modal");
  const container = document.getElementById("preview-content");
  const closeBtn = document.getElementById("preview-close");

  if (!modal || !container || !contentEl) return;

  container.innerHTML = "";
  container.appendChild(contentEl);
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("overflow-hidden");

  const close = () => {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("overflow-hidden");
    container.innerHTML = "";
  };

  const onKey = (event) => {
    if (event.key === "Escape") {
      close();
    }
  };

  const onBackdrop = (event) => {
    if (event.target === modal) {
      close();
    }
  };

  closeBtn?.addEventListener("click", close, { once: true });
  modal.addEventListener("click", onBackdrop, { once: true });
  window.addEventListener("keydown", onKey, { once: true });
}

function buildPreviewElement({ downloadUrl, sourceUrl, thumbUrl, mediaType }) {
  const previewUrl = downloadUrl || sourceUrl || thumbUrl;

  if (!previewUrl) return null;

  if (isYouTubeUrl(previewUrl)) {
    const id = extractYouTubeId(previewUrl);
    if (!id) return null;
    const iframe = document.createElement("iframe");
    iframe.src = `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;
    iframe.allow =
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
    iframe.allowFullscreen = true;
    iframe.className = "w-full h-full";
    return iframe;
  }

  if (mediaType === "audio") {
    const audio = document.createElement("audio");
    audio.src = previewUrl;
    audio.controls = true;
    audio.autoplay = true;
    audio.className = "w-full h-full";
    return audio;
  }

  if (mediaType === "image") {
    const img = document.createElement("img");
    img.src = previewUrl;
    img.alt = "Media preview";
    img.className = "w-full h-full object-contain bg-black";
    return img;
  }

  const video = document.createElement("video");
  video.src = previewUrl;
  video.controls = true;
  video.autoplay = true;
  video.playsInline = true;
  video.className = "w-full h-full";
  if (thumbUrl) {
    video.poster = thumbUrl;
  }
  return video;
}

function initHome() {
  const input = document.getElementById("url-input");
  const button = document.getElementById("download-btn");
  const label = document.getElementById("download-label");

  if (!input || !button) return false;

  const setLoading = (loading) => {
    button.disabled = loading;
    if (label) {
      label.textContent = loading ? "Working..." : "Download";
    }
  };

  const handleSubmit = async () => {
    const url = input.value.trim();
    if (!isValidUrl(url)) {
      window.alert("Please enter a valid URL.");
      return;
    }

    setLoading(true);

    try {
      const data = await fetchInfo(url);
      const payload = {
        sourceUrl: url,
        data,
        fetchedAt: Date.now(),
      };
      sessionStorage.setItem(RESULT_STORAGE_KEY, JSON.stringify(payload));
      window.location.href = "results.html";
    } catch (error) {
      window.alert(error.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  button.addEventListener("click", handleSubmit);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSubmit();
    }
  });

  return true;
}

function initResults() {
  const thumb = document.getElementById("result-thumb");
  const title = document.getElementById("result-title");
  const meta = document.getElementById("result-meta");
  const status = document.getElementById("result-status");
  const durationEl = document.getElementById("result-duration");
  const previewButton = document.getElementById("preview-button");
  const videoButton = document.getElementById("download-video");
  const audioButton = document.getElementById("download-audio");
  const thumbButton = document.getElementById("download-thumb");
  const anotherButton = document.getElementById("download-another");
  const videoTitle = document.getElementById("video-title");
  const videoMeta = document.getElementById("video-meta");

  if (!thumb || !title || !meta || !videoButton) return false;

  if (anotherButton) {
    anotherButton.addEventListener("click", () => {
      window.location.href = "index.html";
    });
  }

  const stored = sessionStorage.getItem(RESULT_STORAGE_KEY);
  if (!stored) {
    window.location.href = "index.html";
    return true;
  }

  let payload;
  try {
    payload = JSON.parse(stored);
  } catch (error) {
    window.location.href = "index.html";
    return true;
  }

  const data = payload.data || {};
  const sourceUrl = payload.sourceUrl || "";
  const caption = data.caption || data.title || "Download ready";
  const hosting = data.hosting || "Instagram";
  const mediaType = String(data.type || "video").toLowerCase();
  let downloadUrl = data.download_url || data.downloadLink || data.download_link || data.url || "";
  const thumbUrl = data.thumb_best || data.thumb || data.thumbnail || "";
  const duration = formatDuration(Number(data.duration));

  if (!downloadUrl && hosting === "youtube" && sourceUrl) {
    downloadUrl = sourceUrl;
  }

  title.textContent = caption;
  meta.textContent = `Source: ${hosting} • ${mediaType.toUpperCase()}`;

  if (durationEl) {
    durationEl.textContent = duration || "";
  }

  if (thumbUrl) {
    thumb.src = thumbUrl;
  } else if (mediaType === "image" && downloadUrl) {
    thumb.src = downloadUrl;
  }

  const baseName = sanitizeFilename(caption || "instagram-media");
  const extension = guessExtension(downloadUrl || thumbUrl, mediaType);
  const filename = `${baseName || "instagram-media"}${extension}`;

  if (previewButton) {
    const element = buildPreviewElement({
      downloadUrl,
      sourceUrl,
      thumbUrl,
      mediaType,
    });
    if (element) {
      previewButton.addEventListener("click", () => {
        openPreviewModal(element);
      });
    } else {
      previewButton.disabled = true;
      previewButton.classList.add("opacity-50", "cursor-not-allowed");
    }
  }

  attachDownload(videoButton, downloadUrl, filename);

  if (videoTitle) {
    if (mediaType === "audio") {
      videoTitle.textContent = "Audio";
    } else if (mediaType === "image") {
      videoTitle.textContent = "Image";
    } else {
      videoTitle.textContent = "Media";
    }
  }
  if (videoMeta) {
    videoMeta.textContent = mediaType === "audio" ? "High Fidelity" : "Highest Quality Available";
  }

  if (thumbButton) {
    if (thumbUrl) {
      const thumbFilename = `${baseName || "thumbnail"}-thumb${guessExtension(thumbUrl, "image")}`;
      attachDownload(thumbButton, thumbUrl, thumbFilename);
    } else {
      thumbButton.disabled = true;
      thumbButton.classList.add("opacity-50", "cursor-not-allowed");
    }
  }

  if (audioButton) {
    audioButton.disabled = true;
    audioButton.classList.add("opacity-50", "cursor-not-allowed");
  }

  if (status) {
    status.innerHTML =
      '<span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Ready to download';
  }

  if (!downloadUrl && status) {
    status.innerHTML =
      '<span class="w-2 h-2 rounded-full bg-red-500"></span> Download unavailable';
  }

  return true;
}

initHome();
initResults();
