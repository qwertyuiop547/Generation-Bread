const ClipPathTitle = ({ title, color, bg, className, borderColor } : { title: string, color: string, bg: string, className: string, borderColor: string}) => {
  return (
    <div className="general-title">
      <div
        style={{
          clipPath: "polygon(0% 0%, 0% 0%, 0% 100%, 0% 100%)",
          borderColor: borderColor,
          willChange: "clip-path",
        }}
        className={`${className} border-[.5vw] text-nowrap`}
        data-benefit-clip
      >
        <div
          className="pb-5 md:px-14 px-3 md:pt-0 pt-3"
          style={{
            backgroundColor: bg,
          }}
        >
          <h2
            style={{
              color: color,
            }}
          >
            {title}
          </h2>
        </div>
      </div>
    </div>
  );
};

export default ClipPathTitle;
