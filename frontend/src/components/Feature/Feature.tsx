import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

interface FeatureProps {
  title: string;
  description: string;
  imageUrl: string;
}

const Feature = ({ title, description, imageUrl }: FeatureProps) => {
  return (
    <Card className="overflow-hidden pt-0">
      <img src={imageUrl} alt={title} className="aspect-video w-full object-cover" />
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardFooter>
        <Button variant="outline">Enroll course</Button>
      </CardFooter>
    </Card>
  );
};

export default Feature;
