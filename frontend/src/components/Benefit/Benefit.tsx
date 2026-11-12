import { Link } from "react-router-dom";
import { RiCheckLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import benefit from "../../assets/benefits.png";

const benefits = ["Efficient Learning", "Personalized Assessments", "Immediate Feedback"];

const Benefit = () => {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-2">
      <div className="flex flex-col items-start gap-6">
        <h2 className="font-heading text-3xl font-bold tracking-tight">Unlock your potential</h2>
        <ul className="flex flex-col gap-3">
          {benefits.map((item) => (
            <li key={item} className="flex items-center gap-2 text-muted-foreground">
              <RiCheckLine className="size-5 text-foreground" />
              {item}
            </li>
          ))}
        </ul>
        <Button size="lg" nativeButton={false} render={<Link to="/signup" />}>
          Register Today
        </Button>
      </div>
      <img src={benefit} alt="benefits" className="w-full rounded-2xl" />
    </section>
  );
};

export default Benefit;
