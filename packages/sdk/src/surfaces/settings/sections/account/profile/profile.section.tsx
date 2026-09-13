"use client";

import { EmptyState } from "@aec-craft/ui/components/blocks/empty-state";
import { Section } from "@aec-craft/ui/components/blocks/section";
import { SectionLoading } from "../../../../../common/ui/states";
import { useMe } from "../../../../../react";
import { ProfileForm } from "./profile.form";

export function AccountProfileSection() {
  const me = useMe();
  const isLoading = me.isLoading;

  return (
    <Section
      description="Your name and photo, as everyone else sees you."
      title="Profile"
    >
      {isLoading ? (
        <SectionLoading />
      ) : me.error || !me.data ? (
        <EmptyState
          description="Check your connection and try again."
          title="We couldn't load your profile."
        />
      ) : (
        <ProfileForm key={me.data.id} me={me.data} />
      )}
    </Section>
  );
}
