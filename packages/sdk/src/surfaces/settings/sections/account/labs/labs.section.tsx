"use client";

import { Section } from "@aec-craft/ui/components/blocks/section";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@aec-craft/ui/components/primitives/field";
import { Switch } from "@aec-craft/ui/components/primitives/switch";

import {
  PREVIEW_EXPERIMENTS,
  usePreference,
} from "../../../../../platform/settings/use-preference";

/**
 * Opt-in to things that are not finished.
 *
 * Account-scoped rather than per-app: somebody who wants to see what is coming
 * wants it everywhere, and a switch repeated in every product is a switch
 * nobody can find. A product team's own experiments still register under its
 * app scope; this only decides whether they are offered at all.
 */
export function AccountLabsSection() {
  const experiments = usePreference<boolean>(PREVIEW_EXPERIMENTS, false);

  return (
    <Section
      description="Turn on work in progress. Expect rough edges, and expect things to change."
      title="Labs"
    >
      <div className="flex flex-col gap-6">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="labs-experiments">
              Show experimental features
            </FieldLabel>
            <FieldDescription>
              Offers features the product teams are still testing, here and
              inside the apps.
            </FieldDescription>
          </FieldContent>
          <Switch
            checked={experiments.value}
            disabled={experiments.isPending}
            id="labs-experiments"
            onCheckedChange={(next) => void experiments.set(next)}
          />
        </Field>
      </div>
    </Section>
  );
}
