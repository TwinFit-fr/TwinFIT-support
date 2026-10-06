import { Suspense } from "react";
import { ImageBoard } from "@/components/images/image-board";

export default function ImagesPage() {
  return (
    <Suspense>
      <ImageBoard />
    </Suspense>
  );
}
