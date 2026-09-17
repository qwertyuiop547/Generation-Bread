"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import type { Html5Qrcode } from "html5-qrcode";

gsap.registerPlugin(useGSAP);

type CameraDevice = { id: string; label: string };
type CameraConfig = string | { facingMode: "user" | "environment" };

const SCANNER_CONFIG = {
  fps: 10,
  qrbox: { width: 250, height: 250 },
  aspectRatio: 1,
};
const TOTAL_TABLES = 10;
const DEPLOYED_WEB_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://generation-bread-web.onrender.com";

function getTableOrderRoute(decodedText: string): string | null {
  if (typeof window === "undefined") return null;

  const value = decodedText.trim();
  const isRelativeUrl = value.startsWith("/");

  try {
    const parsed = new URL(value, window.location.origin);
    const productionHost = new URL(DEPLOYED_WEB_URL).host;
    const allowedHosts = new Set([window.location.host, productionHost]);
    const table = parsed.searchParams.get("table") || "";
    const tableNumber = Number(table);

    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    if (!isRelativeUrl && !allowedHosts.has(parsed.host)) return null;
    if (parsed.pathname !== "/order") return null;
    if (!/^\d+$/.test(table) || tableNumber < 1 || tableNumber > TOTAL_TABLES) return null;

    return `/order?table=${tableNumber}`;
  } catch {
    return null;
  }
}

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

async function stopScanner(scanner: Html5Qrcode | null) {
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
  const pageRef = useRef<HTMLDivElement>(null);
  const scannerFrameRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const isStartingRef = useRef(false);
  const invalidScanCooldownRef = useRef(0);
  const [error, setError] = useState("");
  const [invalidQrMessage, setInvalidQrMessage] = useState("");
  const [scanned, setScanned] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [usingFrontCamera, setUsingFrontCamera] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isLaptop, setIsLaptop] = useState(false);
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [activeCameraIndex, setActiveCameraIndex] = useState(0);

  useGSAP(
    () => {
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reducedMotion) {
        gsap.set([".scan-heading", ".scan-copy", ".scanner-shell"], { autoAlpha: 1, y: 0 });
        return;
      }

      gsap
        .timeline({ defaults: { ease: "power3.out" } })
        .from(".scan-heading", { y: 18, autoAlpha: 0, duration: 0.55 })
        .from(".scan-copy", { y: 12, autoAlpha: 0, duration: 0.45 }, "-=0.32")
        .from(".scanner-shell", { y: 24, scale: 0.97, autoAlpha: 0, duration: 0.65 }, "-=0.28");
    },
    { scope: pageRef }
  );

  useGSAP(
    () => {
      if (!cameraReady || error || scanned) return;

      const frame = scannerFrameRef.current;
      const laser = pageRef.current?.querySelector<HTMLElement>(".scan-laser");
      if (!frame || !laser) return;

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reducedMotion) {
        gsap.set([".scan-laser", ".scan-corner", ".scanner-aura", ".scan-status-dot"], {
          autoAlpha: 1,
        });
        return;
      }

      const laserTween = gsap.fromTo(
        laser,
        { y: 0, autoAlpha: 0.45 },
        {
          y: () => Math.max(0, frame.clientHeight - 42),
          autoAlpha: 1,
          duration: 2.05,
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
          repeatRefresh: true,
        }
      );
      const cornerTween = gsap.to(".scan-corner", {
        scale: 1.08,
        autoAlpha: 0.62,
        duration: 0.9,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
        stagger: { each: 0.12, from: "edges" },
      });
      const auraTween = gsap.to(".scanner-aura", {
        scale: 1.025,
        autoAlpha: 0.85,
        duration: 1.25,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
      });
      const statusTween = gsap.to(".scan-status-dot", {
        scale: 1.65,
        autoAlpha: 0.35,
        duration: 0.75,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
      });

      return () => {
        laserTween.kill();
        cornerTween.kill();
        auraTween.kill();
        statusTween.kill();
      };
    },
    { dependencies: [cameraReady, error, scanned], scope: pageRef, revertOnUpdate: true }
  );

  useGSAP(
    () => {
      if (!scanned) return;

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reducedMotion) {
        gsap.set([".scan-success-ring", ".scan-success-title", ".scan-success-copy", ".scan-success-loader"], {
          autoAlpha: 1,
          scale: 1,
          y: 0,
        });
        gsap.set(".scan-success-check", { strokeDashoffset: 0 });
        return;
      }

      gsap
        .timeline({ defaults: { ease: "power3.out" } })
        .fromTo(
          ".scan-success-ring",
          { scale: 0.55, autoAlpha: 0, rotation: -12 },
          { scale: 1, autoAlpha: 1, rotation: 0, duration: 0.55, ease: "back.out(1.8)" }
        )
        .to(".scan-success-check", { strokeDashoffset: 0, duration: 0.42, ease: "power2.out" }, "-=0.25")
        .from(".scan-success-title", { y: 16, autoAlpha: 0, duration: 0.4 }, "-=0.2")
        .from(".scan-success-copy", { y: 10, autoAlpha: 0, duration: 0.35 }, "-=0.25")
        .from(".scan-success-loader", { scaleX: 0, autoAlpha: 0, duration: 0.45 }, "-=0.15");
    },
    { dependencies: [scanned], scope: pageRef, revertOnUpdate: true }
  );

  const handleScanSuccess = useCallback(
    (decodedText: string) => {
      const orderRoute = getTableOrderRoute(decodedText);
      if (!orderRoute) {
        const now = Date.now();
        if (now >= invalidScanCooldownRef.current) {
          invalidScanCooldownRef.current = now + 2500;
          setInvalidQrMessage(
            "Hindi ito valid na Generation Bread table QR. I-scan ang QR na naka-display sa mesa."
          );
        }
        return;
      }

      setInvalidQrMessage("");
      setScanned(true);
      void stopScanner(html5QrCodeRef.current);
      setTimeout(() => router.push(orderRoute), 1500);
    },
    [router]
  );

  const detectActiveCamera = useCallback((scanner: Html5Qrcode, onLaptop: boolean) => {
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
    setInvalidQrMessage("");
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
    setMounted(true);
    setIsLaptop(!isLikelyMobile());
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
    <div ref={pageRef} className="min-h-screen bg-black flex flex-col items-center relative overflow-hidden">
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
            <div className="scan-success-ring w-24 h-24 mx-auto mb-6 bg-light-brown/20 border border-light-brown/35 rounded-full flex items-center justify-center shadow-[0_0_55px_rgba(227,164,88,0.22)] will-change-transform">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-light-brown" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline
                  className="scan-success-check"
                  points="20 6 9 17 4 12"
                  pathLength="1"
                  strokeDasharray="1"
                  strokeDashoffset="1"
                />
              </svg>
            </div>
            <h1 className="scan-success-title text-3xl md:text-4xl font-bold text-milk uppercase tracking-tighter mb-3">
              QR Scanned!
            </h1>
            <p className="scan-success-copy font-paragraph text-milk/60 text-lg">
              Loading menu...
            </p>
            <div className="scan-success-loader mt-7 mx-auto h-1 w-36 origin-left overflow-hidden rounded-full bg-light-brown/20">
              <div className="h-full w-full bg-gradient-to-r from-mid-brown via-light-brown to-milk" />
            </div>
          </div>
        ) : (
          <>
            <h1 className="scan-heading text-3xl md:text-4xl font-bold text-milk uppercase tracking-tighter mb-2 text-center">
              Scan QR Code
            </h1>
            <p className="scan-copy font-paragraph text-milk/60 mb-4 text-center" suppressHydrationWarning>
              {mounted && isLaptop
                ? "Itutok ang laptop webcam sa QR code (para sa testing)"
                : "Itutok ang rear camera sa QR code sa mesa"}
            </p>
            {mounted && isLaptop && (
              <p className="font-paragraph text-milk/40 text-xs mb-8 text-center max-w-xs" suppressHydrationWarning>
                Walang rear camera ang laptop. Para sa totoong scan sa mesa, gamitin ang phone.
              </p>
            )}
            {(!mounted || !isLaptop) && <div className="mb-8" />}

            <div className="scanner-shell w-full relative will-change-transform">
              <div
                ref={scannerFrameRef}
                className="relative bg-black/30 backdrop-blur-sm rounded-3xl overflow-hidden border border-white/10 shadow-2xl"
              >
                <div
                  id="qr-reader"
                  ref={scannerRef}
                  className="w-full"
                  style={{ minHeight: "300px" }}
                ></div>

                {!error && (
                  <>
                    <div aria-hidden className="scanner-aura absolute inset-2 rounded-[1.25rem] border border-light-brown/25 opacity-40 pointer-events-none will-change-transform" />
                    <div aria-hidden className="scan-corner absolute top-4 left-4 w-10 h-10 border-t-4 border-l-4 border-light-brown rounded-tl-xl pointer-events-none will-change-transform"></div>
                    <div aria-hidden className="scan-corner absolute top-4 right-4 w-10 h-10 border-t-4 border-r-4 border-light-brown rounded-tr-xl pointer-events-none will-change-transform"></div>
                    <div aria-hidden className="scan-corner absolute bottom-4 left-4 w-10 h-10 border-b-4 border-l-4 border-light-brown rounded-bl-xl pointer-events-none will-change-transform"></div>
                    <div aria-hidden className="scan-corner absolute bottom-4 right-4 w-10 h-10 border-b-4 border-r-4 border-light-brown rounded-br-xl pointer-events-none will-change-transform"></div>
                    {cameraReady && (
                      <div
                        aria-hidden
                        className="scan-laser absolute left-5 right-5 top-5 h-[2px] pointer-events-none opacity-0 will-change-transform"
                      >
                        <div className="absolute inset-x-0 -top-3 h-7 bg-gradient-to-b from-transparent via-light-brown/20 to-transparent blur-sm" />
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-light-brown to-transparent shadow-[0_0_14px_rgba(227,164,88,0.9)]" />
                      </div>
                    )}
                  </>
                )}
              </div>

              {cameraReady && !error && (
                <div className="mt-4 flex flex-col items-center gap-3">
                  <div className="flex items-center justify-center gap-2">
                    <div className="scan-status-dot w-2 h-2 bg-light-brown rounded-full will-change-transform"></div>
                    <p className="font-paragraph text-milk/50 text-sm text-center" suppressHydrationWarning>
                      {mounted && isLaptop
                        ? "Ginagamit ang laptop webcam"
                        : usingFrontCamera
                          ? "Front camera — pindutin ang Switch Camera para sa rear"
                          : "Scanning..."}
                    </p>
                  </div>

                  {mounted && !isLaptop && cameras.length > 1 && (
                    <button
                      type="button"
                      onClick={switchCamera}
                      className="cursor-pointer px-4 py-2 rounded-full border border-light-brown/40 text-milk text-sm font-bold hover:bg-light-brown/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-light-brown"
                    >
                      Switch Camera
                    </button>
                  )}
                </div>
              )}

              {invalidQrMessage && !error && (
                <div
                  className="mt-4 rounded-xl border border-red-brown/35 bg-red-brown/15 px-4 py-3 text-center font-paragraph text-sm text-milk"
                  role="status"
                  aria-live="polite"
                >
                  {invalidQrMessage}
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
                    className="cursor-pointer px-4 py-2 rounded-full bg-light-brown text-dark-brown text-sm font-bold hover:bg-mid-brown hover:text-milk transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-light-brown"
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
