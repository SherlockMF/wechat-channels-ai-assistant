import { PageHeader } from "@/components/ui";
import { CreatorWorkspace } from "@/features/creator-studio/creator-workspace";

export default function CreatorStudioPage() {
  return <><PageHeader eyebrow="Creator Library" title="创作资料" description="把真实素材、固定栏目和认可的表达积累下来，让下一次创作更贴近这个账号。" /><CreatorWorkspace /></>;
}
