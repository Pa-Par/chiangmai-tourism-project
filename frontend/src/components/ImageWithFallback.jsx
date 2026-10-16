import { useEffect, useState } from "react";

function getGoogleDriveFileId(imageUrl) {
  try {
    const url = new URL(imageUrl);
    const isGoogleDriveHost =
      url.hostname === "drive.google.com" ||
      url.hostname === "drive.usercontent.google.com";

    if (!isGoogleDriveHost) {
      return null;
    }

    return url.searchParams.get("id") || url.pathname.match(/\/d\/([^/]+)/)?.[1] || null;
  } catch {
    return null;
  }
}

function getDisplayImageUrl(imageUrl) {
  const fileId = getGoogleDriveFileId(imageUrl);

  // Google Drive's /uc endpoint redirects to a resource that disallows
  // cross-site embedding. Its thumbnail endpoint returns an embeddable image.
  return fileId
    ? `https://lh3.googleusercontent.com/d/${fileId}=w1200`
    : imageUrl;
}

/**
 * A small reusable image wrapper. Keeping image handling here means the
 * current single image can later be replaced by a carousel without changing
 * the cards that display it.
 */
function ImageWithFallback({ src, alt, className = "", fallbackText }) {
  const [hasLoadError, setHasLoadError] = useState(!src);
  const displaySource = src ? getDisplayImageUrl(src) : "";

  useEffect(() => {
    setHasLoadError(!src);
  }, [src]);

  if (hasLoadError) {
    return (
      <div
        className={`${className} image-fallback`}
        role="img"
        aria-label={fallbackText}
      >
        <span aria-hidden="true">▧</span>
        <strong>{fallbackText}</strong>
      </div>
    );
  }

  return (
    <img
      className={className}
      src={displaySource}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setHasLoadError(true)}
    />
  );
}

export default ImageWithFallback;
