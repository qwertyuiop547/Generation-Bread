"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type CameraDevice = { id: string; label: string };
type CameraConfig = string | { facingMode: "user" | "environment" };

const SCANNER_CONFIG = {
  fps: 10,
  qrbox: { width: 250, height: 250 },
  aspectRatio: 1,
};

function isLikelyMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function getCameraAttempts(isLaptop: boolean): CameraConfig[] {
  // Laptop: webcam lang — walang rear camera.
  if (isLaptop) {
    return [{ facingMode: "user" }];
  }
  // Phone: rear muna, front bilang fallback.
  return [{ facingMode: "environment" }, { facingMode: "user" }];
}

function getCameraErrorMessage(error: unknown): string {
  const name =
    error instanceof DOMException
      ? error.name
      : error instanceof Error
        ? error.name
        : "";

  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Na-block ang camera. Sa address bar, i-click ang lock/camera icon → Allow ang Camera → i-refresh ang page.";
  }

  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "Walang nakitang camera sa device na ito.";
  }

  if (name === "NotReadableError" || name === "TrackStartError") {
    return "Ginagamit ng ibang app ang camera. Isara ang Camera/Zoom/Teams, tapos subukan ulit.";
  }

  return "Hindi ma-start ang camera. Payagan ang camera permission at subukan ulit.";
}

async function stopScanner(scanner: any) {
  if (!scanner) return;

  try {
    if (scanner.getState?.() === 2 || scanner.isScanning) {
      await scanner.stop();
    }
  } catch {
    // Scanner may already be stopped.
  }

  try {
    scanner.clear?.();
  } catch {
    // Container may already be cleared.
  }
}

async function listVideoDevices(): Promise<CameraDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];

  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((device) => device.kind === "videoinput")
    .map((device, index) => ({
      id: device.deviceId,
      label: device.label || `Camera ${index + 1}`,
    }));
}

async function requestAnyCameraAccess(): Promise<boolean> {
  if (!navigator.mediaDevices?.getUserMedia) return false;

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: true,
  });
  stream.getTracks().forEach((track) => track.stop());
  return true;
}

export default function ScanPage() {
  const router = useRouter();
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrCodeRef = useRef<any>(null);
  const isStartingRef = useRef(false);
  const [error, setError] = useState("");
  const [scanned, setScanned] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [usingFrontCamera, setUsingFrontCamera] = useState(false);
  const [isLaptop, setIsLaptop] = useState(() =>
    typeof window !== "undefined" ? !isLikelyMobile() : false
  );
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [activeCameraIndex, setActiveCameraIndex] = useState(0);

  const handleScanSuccess = useCallback(
    (_decodedText: string) => {
      setScanned(true);
      stopScanner(html5QrCodeRef.current);
      setTimeout(() => router.push("/order"), 1500);
    },
    [router]
  );

  const detectActiveCamera = useCallback((scanner: any, onLaptop: boolean) => {
    try {
      const settings = scanner.getRunningTrackSettings?.();
      const facingMode = settings?.facingMode;
      setUsingFrontCamera(onLaptop || facingMode === "user");
    } catch {
      setUsingFrontCamera(onLaptop);
    }
  }, []);

  const startWithCamera = useCallback(
    async (cameraConfig: CameraConfig, onLaptop: boolean) => {
      const { Html5Qrcode } = await import("html5-qrcode");

      await stopScanner(html5QrCodeRef.current);
      scannerRef.current?.replaceChildren();

      const scanner = new Html5Qrcode("qr-reader");
      html5QrCodeRef.current = scanner;

      await scanner.start(
        cameraConfig,
        SCANNER_CONFIG,
        handleScanSuccess,
        () => {}
      );

      detectActiveCamera(scanner, onLaptop);
      return scanner;
    },
    [detectActiveCamera, handleScanSuccess]
  );

  const startScanner = useCallback(async () => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;
    setError("");
    setCameraReady(false);

    try {
      await requestAnyCameraAccess();
      const devices = await listVideoDevices();
      const onLaptop = !isLikelyMobile() || devices.length <= 1;
      setIsLaptop(onLaptop);
      setCameras(devices);

      let started = false;
      let lastError: unknown = null;

      for (const attempt of getCameraAttempts(onLaptop)) {
        try {
          await startWithCamera(attempt, onLaptop);
          started = true;
          break;
        } catch (attemptError) {
          lastError = attemptError;
        }
      }

      if (!started && devices.length > 0) {
        for (const device of devices) {
          try {
            await startWithCamera(device.id, onLaptop);
            const index = devices.findIndex((entry) => entry.id === device.id);
            setActiveCameraIndex(index >= 0 ? index : 0);
            started = true;
            break;
          } catch (deviceError) {
            lastError = deviceError;
          }
        }
      }

      if (!started) {
        throw lastError ?? new Error("Camera start failed");
      }

      setCameraReady(true);
    } catch (startError) {
      console.warn("Camera error:", startError);
      setError(getCameraErrorMessage(startError));
      setCameraReady(false);
    } finally {
      isStartingRef.current = false;
    }
  }, [startWithCamera]);

  const switchCamera = useCallback(async () => {
    if (isStartingRef.current || cameras.length < 2) return;
    isStartingRef.current = true;
    setError("");
    setCameraReady(false);

    try {
      const nextIndex = (activeCameraIndex + 1) % cameras.length;
      await startWithCamera(cameras[nextIndex].id, isLaptop);
      setActiveCameraIndex(nextIndex);
      setCameraReady(true);
    } catch (switchError) {
      console.warn("Switch camera error:", switchError);
      setError(getCameraErrorMessage(switchError));
    } finally {
      isStartingRef.current = false;
    }
  }, [activeCameraIndex, cameras, isLaptop, startWithCamera]);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      if (!cancelled) {
        await startScanner();
      }
    };

    boot();

    return () => {
      cancelled = true;
      isStartingRef.current = false;
      stopScanner(html5QrCodeRef.current);
      html5QrCodeRef.current = null;
    };
  }, [startScanner]);

  return (
    <div className="min-h-screen bg-[#222123] flex flex-col items-center relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40vw] h-[40vw] bg-dark-brown rounded-full mix-blend-screen filter blur-3xl opacity-20"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] bg-mid-brown rounded-full mix-blend-screen filter blur-3xl opacity-20"></div>

      <div className="w-full flex items-center justify-between px-5 md:px-10 py-5 z-10">
        <Link href="/dashboard" className="group flex items-center gap-2 text-milk font-bold hover:text-light-brown transition-colors text-sm">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:-translate-x-1 transition-transform">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back
        </Link>
        <Link
          href="/"
          className="group text-right leading-none hover:opacity-90 transition-opacity"
          aria-label="Generation Bread home"
        >
          <span className="block font-bold uppercase tracking-[0.12em] text-milk text-base md:text-lg drop-shadow-sm">
            Generation
          </span>
          <span className="block font-bold uppercase tracking-[0.12em] text-light-brown text-base md:text-lg drop-shadow-sm group-hover:text-mid-brown transition-colors">
            Bread
          </span>
        </Link>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-5 w-full max-w-md z-10">
        {scanned ? (
          <div className="text-center">
            <div className="w-24 h-24 mx-auto mb-6 bg-light-brown/20 rounded-full flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#e3a458" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-milk uppercase tracking-tighter mb-3">
              QR Scanned!
            </h1>
            <p className="font-paragraph text-milk/60 text-lg">
              Loading menu...
            </p>
            <div className="mt-6 flex justify-center">
              <div className="w-8 h-8 border-4 border-light-brown/30 border-t-light-brown rounded-full animate-spin"></div>
            </div>
          </div>
        ) : (
          <>
            <h1 className="text-3xl md:text-4xl font-bold text-milk uppercase tracking-tighter mb-2 text-center">
              Scan QR Code
            </h1>
            <p className="font-paragraph text-milk/60 mb-4 text-center">
              {isLaptop
                ? "Itutok ang laptop webcam sa QR code (para sa testing)"
                : "Itutok ang rear camera sa QR code sa mesa"}
            </p>
            {isLaptop && (
              <p className="font-paragraph text-milk/40 text-xs mb-8 text-center max-w-xs">
                Walang rear camera ang laptop. Para sa totoong scan sa mesa, gamitin ang phone.
              </p>
            )}
            {!isLaptop && <div className="mb-8" />}

            <div className="w-full relative">
              <div className="relative bg-black/30 backdrop-blur-sm rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
                <div
                  id="qr-reader"
                  ref={scannerRef}
                  className="w-full"
                  style={{ minHeight: "300px" }}
                ></div>

                {!error && (
                  <>
                    <div className="absolute top-4 left-4 w-10 h-10 border-t-4 border-l-4 border-light-brown rounded-tl-xl pointer-events-none"></div>
                    <div className="absolute top-4 right-4 w-10 h-10 border-t-4 border-r-4 border-light-brown rounded-tr-xl pointer-events-none"></div>
                    <div className="absolute bottom-4 left-4 w-10 h-10 border-b-4 border-l-4 border-light-brown rounded-bl-xl pointer-events-none"></div>
                    <div className="absolute bottom-4 right-4 w-10 h-10 border-b-4 border-r-4 border-light-brown rounded-br-xl pointer-events-none"></div>
                  </>
                )}
              </div>

              {cameraReady && !error && (
                <div className="mt-4 flex flex-col items-center gap-3">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-2 h-2 bg-light-brown rounded-full animate-pulse"></div>
                    <p className="font-paragraph text-milk/50 text-sm text-center">
                      {isLaptop
                        ? "Ginagamit ang laptop webcam"
                        : usingFrontCamera
                          ? "Front camera — pindutin ang Switch Camera para sa rear"
                          : "Scanning..."}
                    </p>
                  </div>

                  {!isLaptop && cameras.length > 1 && (
                    <button
                      type="button"
                      onClick={switchCamera}
                      className="px-4 py-2 rounded-full border border-light-brown/40 text-milk text-sm font-bold hover:bg-light-brown/20 transition-colors"
                    >
                      Switch Camera
                    </button>
                  )}
                </div>
              )}
            </div>

            {error && (
              <div className="mt-6 bg-red-brown/20 border border-red-brown/30 text-milk rounded-xl px-5 py-4 text-center w-full space-y-3">
                <p className="font-paragraph text-sm">{error}</p>
                <div className="flex flex-col sm:flex-row gap-2 justify-center">
                  <button
                    type="button"
                    onClick={startScanner}
                    className="px-4 py-2 rounded-full bg-light-brown text-dark-brown text-sm font-bold hover:bg-mid-brown hover:text-milk transition-colors"
                  >
                    Payagan ang Camera
                  </button>
                  <Link
                    href="/order"
                    className="px-4 py-2 rounded-full border border-milk/30 text-milk text-sm font-bold hover:bg-white/10 transition-colors"
                  >
                    Direktang Order
                  </Link>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="h-10"></div>
    </div>
  );
}
