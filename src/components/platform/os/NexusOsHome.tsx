import { NexusOsHeader } from "@/components/platform/os/NexusOsHeader";
import { BusinessDashboard } from "@/components/platform/os/dashboards/BusinessDashboard";
import { CoreDashboard } from "@/components/platform/os/dashboards/CoreDashboard";
import { HeleLivetDashboard } from "@/components/platform/os/dashboards/HeleLivetDashboard";
import { PrivatDashboard } from "@/components/platform/os/dashboards/PrivatDashboard";
import type { OsContext } from "@/lib/os/context";
import { heleLivet, mockMeta, privat, business, core } from "@/lib/os/mock-data";

const HEADER: Record<
  OsContext,
  { title: string; subtitle?: string; showSun?: boolean }
> = {
  hele: {
    title: heleLivet.greeting,
    subtitle: undefined,
    showSun: true,
  },
  privat: {
    title: privat.title,
    subtitle: privat.subtitle,
    showSun: true,
  },
  business: {
    title: business.title,
    subtitle: business.subtitle,
  },
  core: {
    title: core.title,
    subtitle: core.subtitle,
  },
};

export function NexusOsHome({ kontekst }: { kontekst: OsContext }) {
  const header = HEADER[kontekst];

  return (
    <>
      <NexusOsHeader
        title={header.title}
        subtitle={header.subtitle}
        dateLabel={mockMeta.dateLabel}
        kontekst={kontekst}
        showSun={header.showSun}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {kontekst === "hele" && <HeleLivetDashboard />}
        {kontekst === "privat" && <PrivatDashboard />}
        {kontekst === "business" && <BusinessDashboard />}
        {kontekst === "core" && <CoreDashboard />}
      </div>
    </>
  );
}
