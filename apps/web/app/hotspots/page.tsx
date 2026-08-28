import { HotspotWorkspace } from "@/features/hotspots/hotspot-workspace";
import { PageHeader } from "@/components/ui";

export default function HotspotsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Hotspot Research"
        title="研究热点"
        description="从新闻源与热榜抓取近期条目，按智能家居相关赛道过滤后给出可拍选题。热点只说明时效背景，不承诺效果数据。"
      />
      <HotspotWorkspace />
    </>
  );
}
