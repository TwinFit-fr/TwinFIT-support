import { Suspense } from "react";
import { ImageStylesPage } from "@/components/images/settings/image-styles-page";

export default function ImagesStylesRoute() {
  return (
    <Suspense>
      <ImageStylesPage />
    </Suspense>
  );
}
