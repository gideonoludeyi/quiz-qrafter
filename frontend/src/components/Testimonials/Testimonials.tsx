import { useRef } from "react";
import Autoplay from "embla-carousel-autoplay";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import profileImage from "../../assets/profile.jpg";

const Testimonials = () => {
  const autoplay = useRef(
    Autoplay({ delay: 3000, stopOnMouseEnter: true, stopOnInteraction: false }),
  );
  // Placeholder data for testimonials
  const testimonials = [
    {
      id: 1,
      text: "This platform has transformed the way I learn. The courses are fantastic and the community is incredibly supportive.",
      author: "Jane Doe",
      image: profileImage,
      linkedin: "https://www.linkedin.com/in/janedoe/",
    },
    {
      id: 2,
      text: "I've gained so much confidence since I started using Quiz Qrafter. The quizzes are both challenging and fun.",
      author: "John Smith",
      image: profileImage,
      linkedin: "https://www.linkedin.com/in/janedoe/",
    },
    {
      id: 3,
      text: "This platform has transformed the way I learn. The courses are fantastic and the community is incredibly supportive.",
      author: "Jane Doe",
      image: profileImage,
      linkedin: "https://www.linkedin.com/in/janedoe/",
    },
    {
      id: 4,
      text: "I've gained so much confidence since I started using Quiz Qrafter. The quizzes are both challenging and fun.",
      author: "John Smith",
      image: profileImage,
      linkedin: "https://www.linkedin.com/in/janedoe/",
    },
    // Add more testimonials as needed
  ];

  return (
    <section className="bg-muted/40 py-16">
      <div className="mx-auto max-w-3xl px-12">
        <h2 className="mb-8 text-center font-heading text-3xl font-bold tracking-tight">
          What students say
        </h2>
        <Carousel opts={{ loop: true }} plugins={[autoplay.current]}>
          <CarouselContent>
            {testimonials.map((testimonial) => (
              <CarouselItem key={testimonial.id}>
                <Card>
                  <CardContent className="flex flex-col items-center gap-4 text-center">
                    <a href={testimonial.linkedin} target="_blank" rel="noopener noreferrer">
                      <Avatar size="lg" className="size-16">
                        <AvatarImage src={testimonial.image} alt={testimonial.author} />
                        <AvatarFallback>{testimonial.author.slice(0, 2)}</AvatarFallback>
                      </Avatar>
                    </a>
                    <blockquote className="text-lg text-balance">“{testimonial.text}”</blockquote>
                    <p className="text-sm font-medium text-muted-foreground">
                      {testimonial.author}
                    </p>
                  </CardContent>
                </Card>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>
      </div>
    </section>
  );
};

export default Testimonials;
