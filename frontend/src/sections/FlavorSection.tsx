import FlavorTitle from "@/components/FlavorTitle";
import FlavorSlider from "@/components/FlavorSlider";

const FlavorSection = () => {
  return (
    <section className="flavor-section">
      <div className="flavor-container h-full flex lg:flex-row flex-col items-center gap-5 md:gap-0 relative will-change-transform">
        <div className="relative z-40 w-full lg:w-[57%] flex-none min-h-0 sm:min-h-[22rem] h-auto lg:h-full md:mt-20 xl:mt-0 py-3 sm:py-8 lg:py-0 md:z-auto">
          <FlavorTitle />
        </div>
        <div className="relative z-0 h-full w-full md:w-auto">
          <FlavorSlider />
        </div>
      </div>
    </section>
  );
};

export default FlavorSection;
