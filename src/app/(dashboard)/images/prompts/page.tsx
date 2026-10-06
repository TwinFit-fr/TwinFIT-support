import { redirect } from "next/navigation";

/** Prompts are a tab of each style. */
export default function ImagesPromptsRoute() {
  redirect("/images/styles?tab=prompts");
}
