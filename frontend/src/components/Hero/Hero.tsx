import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import hImage from "../../assets/heroPic.png";

const Hero = () => {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-2 md:py-24">
      <div className="flex flex-col items-start gap-4">
        <h1 className="font-heading text-4xl font-bold tracking-tight text-balance md:text-5xl">
          Best online platform for learning
        </h1>
        <p className="text-lg text-muted-foreground">Your personal AI tutor</p>
        <Button size="lg" nativeButton={false} render={<Link to="/signup" />}>
          Get Started
        </Button>
      </div>
      <img src={hImage} alt="Students learning online" className="w-full rounded-2xl" />
    </section>
  );
};

export default Hero;
