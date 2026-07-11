import Image from "next/image";
import { useRef, useEffect } from "react";
import { safePlay } from "@/lib/safeVideo";

const FooterSection = () => {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Force-play splash video when visible (mobile browsers block autoplay)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          safePlay(video);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(video);
    safePlay(video);
    return () => observer.disconnect();
  }, []);

  return (
    <footer className="footer-section">
      <Image src="/images/footer-dip.webp" alt="" width={3000} height={3000} className="w-full object-cover -translate-y-1" />

      <div className="2xl:h-[110dvh] relative md:pt-[20vh] pt-[10vh]">
        <div className="overflow-hidden z-10 relative">
          <h1 className="general-title text-center text-milk py-5">#CHUGRESPONSIBLY</h1>
        </div>

        <video
          ref={videoRef}
          src="/videos/splash1.mp4"
          playsInline
          muted
          loop
          preload="auto"
          className="absolute top-0 object-contain mix-blend-lighten w-full h-auto"
        />

        <div className="flex-center gap-5 relative z-10 md:mt-20 mt-5">
          <div className="social-btn">
            <Image src="/images/social-youtube.svg" alt="YouTube" width={50} height={50} />
          </div>
          <div className="social-btn">
            <Image src="/images/social-instagram.svg" alt="Instagram" width={50} height={50} />
          </div>
          <div className="social-btn">
            <Image src="/images/tiktok.svg" alt="TikTok" width={50} height={50} />
          </div>
        </div>

        <div className="md:mt-40 mt-20 md:px-10 px-5 flex gap-10 md:flex-row flex-col justify-between text-milk font-paragraph md:text-lg font-medium">
          <div className="flex flex-wrap md:flex-nowrap items-start md:items-center md:gap-16 gap-8">
            <div>
              <p>Generation Bread Menu</p>
            </div>
            <div>
              <p>Chug Club</p>
              <p>Student Marketing</p>
              <p>Dairy Dealers</p>
            </div>
            <div>
              <p>Company</p>
              <p>Contacts</p>
              <p>Tasty Talk</p>
            </div>
          </div>

          <div className="md:max-w-lg mt-10 md:mt-0">
            <p>Get Exclusive Early Access and Stay Informed About Product Updates, Events, and More!</p>
            <label htmlFor="footer-email" className="sr-only">
              Email address
            </label>
            <div className="flex justify-between items-center border-b border-[#D9D9D9] py-5 md:mt-10 mt-5">
              <input
                id="footer-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="Enter your email"
                className="w-full placeholder:font-sans placeholder:text-[#999999] bg-transparent outline-none text-2xl md:text-3xl"
              />
              <Image src="/images/arrow.svg" alt="arrow" width={70} height={70} className="w-8 md:w-[70px] h-auto" />
            </div>
          </div>
        </div>

        <div className="copyright-box">
          <p>
            Copyright © 2025 Generation Bread - All Rights Reserved
          </p>
          <div className="flex items-center gap-7">
            <p>Privacy Policy</p>
            <p>Terms of Service</p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default FooterSection;
