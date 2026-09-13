"use client";

import { EmptyState } from "@aec-craft/ui/components/blocks/empty-state";
import { Section } from "@aec-craft/ui/components/blocks/section";
import { BellIcon } from "@aec-craft/ui/icons";

export function AccountNotificationsSection() {
  return (
    <Section
      description="Decide what we email you about."
      title="Notifications"
    >
      <EmptyState
        description="Soon you'll be able to fine-tune your email preferences right here."
        icon={BellIcon}
        title="Notifications are on the way"
        variant="dashed"
      />
    </Section>
  );
}
