"use client";

import { EmptyState } from "@aec-craft/ui/components/blocks/empty-state";
import { Section } from "@aec-craft/ui/components/blocks/section";
import { CreditCardIcon } from "@aec-craft/ui/icons";

export function OrgBillingSection() {
  return (
    <Section description="Your plan, usage, and invoices." title="Billing">
      <EmptyState
        description="Soon you'll manage your plan and invoices right here."
        icon={CreditCardIcon}
        title="Billing is on the way"
        variant="dashed"
      />
    </Section>
  );
}
