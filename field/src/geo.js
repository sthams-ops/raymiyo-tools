// Phone location and photo helpers.

// Asks the phone for its GPS position. Rejects with a message a person can act on.
export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("This phone or browser cannot share location. Open the app in Chrome or Safari."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy || 0) }),
      (e) => {
        if (e.code === 1) reject(new Error("Location is blocked. Allow location for this site in your browser settings, then try again."));
        else if (e.code === 3) reject(new Error("GPS took too long. Step outside or near a window and try again."));
        else reject(new Error("Could not get your location. Check that GPS is on and try again."));
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 15000 }
    );
  });
}

// Shrinks a camera photo to a small JPEG so it uploads fast on mobile data.
export async function shrinkPhoto(file, maxSide = 1000, quality = 0.6) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("That photo could not be read."));
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}
