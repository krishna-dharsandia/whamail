"use client";

import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Gauge, Loader2 } from "lucide-react";

import { getWhatsAppBridge, type SendingSettings } from "@/hooks/use-whatsapp";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

type FormState = Record<keyof SendingSettings, string>;

interface FieldSpec {
  key: keyof SendingSettings;
  label: string;
  hint?: string;
  suffix?: string;
}

const PACE_FIELDS: FieldSpec[] = [
  { key: "intervalSeconds", label: "Pause between messages", suffix: "seconds", hint: "30 seconds or more." },
  {
    key: "delayJitterPercent",
    label: "Random extra pause",
    suffix: "%",
    hint: "Adds up to this much on top, so the timing is never regular.",
  },
  { key: "hourlyLimit", label: "Messages per hour" },
  { key: "dailyLimit", label: "Messages per day" },
];

const FAILURE_FIELDS: FieldSpec[] = [
  {
    key: "failureBackoffBaseSeconds",
    label: "Wait after a failure",
    suffix: "seconds",
    hint: "Doubles with each failure in a row.",
  },
  { key: "failureBackoffMaxSeconds", label: "Longest wait", suffix: "seconds" },
  {
    key: "maxConsecutiveFailures",
    label: "Stop after failures in a row",
    hint: "Numbers that are not on WhatsApp are skipped and do not count.",
  },
];

function toForm(settings: SendingSettings): FormState {
  return Object.fromEntries(Object.entries(settings).map(([key, value]) => [key, String(value)])) as FormState;
}

function Usage({ label, used, limit }: { label: string; used: number; limit: number }) {
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          {used.toLocaleString()} of {limit.toLocaleString()}
        </span>
      </div>
      <Progress value={percent} className="h-1.5" aria-label={`${label}: ${used} of ${limit}`} />
    </div>
  );
}

/** How fast queued WhatsApp messages go out, and when a run stops by itself. */
export function SendingSettingsCard({ refreshKey }: { refreshKey: number }) {
  const formId = useId();
  const [form, setForm] = useState<FormState | null>(null);
  const [saved, setSaved] = useState<SendingSettings | null>(null);
  const [usage, setUsage] = useState({ sentToday: 0, sentLastHour: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    const wa = getWhatsAppBridge();
    if (!wa) return;
    let cancelled = false;
    wa.getSettings().then((snapshot) => {
      if (cancelled) return;
      setSaved(snapshot.settings);
      setUsage({ sentToday: snapshot.sentToday, sentLastHour: snapshot.sentLastHour });
      // Keep whatever the person is typing; only fill the form the first time.
      setForm((current) => current ?? toForm(snapshot.settings));
    });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const dirty = form !== null && saved !== null && JSON.stringify(form) !== JSON.stringify(toForm(saved));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const wa = getWhatsAppBridge();
    if (!wa || !form) return;

    const next = {
      dailyLimit: Number(form.dailyLimit),
      hourlyLimit: Number(form.hourlyLimit),
      intervalSeconds: Number(form.intervalSeconds),
      delayJitterPercent: Number(form.delayJitterPercent),
      failureBackoffBaseSeconds: Number(form.failureBackoffBaseSeconds),
      failureBackoffMaxSeconds: Number(form.failureBackoffMaxSeconds),
      maxConsecutiveFailures: Number(form.maxConsecutiveFailures),
      defaultCountryCode: form.defaultCountryCode.trim(),
    };

    setSaving(true);
    setError(null);
    const result = await wa.saveSettings(next);
    setSaving(false);

    if (!result.success || !result.settings) {
      setError(result.error ?? "Could not save the settings.");
      return;
    }
    setSaved(result.settings);
    setForm(toForm(result.settings));
    toast.success("Sending pace saved.");
  }

  function renderField(field: FieldSpec) {
    if (!form) return null;
    const inputId = `${formId}-${field.key}`;
    const hintId = field.hint ? `${inputId}-hint` : undefined;
    return (
      <div key={field.key} className="space-y-1.5">
        <Label htmlFor={inputId}>{field.label}</Label>
        <div className="flex items-center gap-2">
          <Input
            id={inputId}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            className="w-28 tabular-nums"
            value={form[field.key]}
            aria-describedby={hintId}
            onChange={(e) => {
              setError(null);
              setForm((current) => (current ? { ...current, [field.key]: e.target.value } : current));
            }}
          />
          {field.suffix && <span className="text-sm text-muted-foreground">{field.suffix}</span>}
        </div>
        {field.hint && (
          <p id={hintId} className="text-xs text-muted-foreground">
            {field.hint}
          </p>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gauge className="h-5 w-5" aria-hidden="true" />
          Sending pace
        </CardTitle>
        <CardDescription>
          Slow, uneven sending keeps your WhatsApp account from being flagged as automated.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {!form || !saved ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-8 w-1/2" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              <Usage label="Sent this hour" used={usage.sentLastHour} limit={saved.hourlyLimit} />
              <Usage label="Sent today" used={usage.sentToday} limit={saved.dailyLimit} />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{PACE_FIELDS.map(renderField)}</div>

            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-defaultCountryCode`}>Default country code</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground" aria-hidden="true">
                  +
                </span>
                <Input
                  id={`${formId}-defaultCountryCode`}
                  inputMode="numeric"
                  maxLength={4}
                  className="w-20 tabular-nums"
                  value={form.defaultCountryCode}
                  aria-describedby={`${formId}-defaultCountryCode-hint`}
                  onChange={(e) => {
                    setError(null);
                    setForm((current) =>
                      current ? { ...current, defaultCountryCode: e.target.value.replace(/\D/g, "") } : current,
                    );
                  }}
                />
              </div>
              <p id={`${formId}-defaultCountryCode-hint`} className="text-xs text-muted-foreground">
                Added to numbers saved without one. 91 is India.
              </p>
            </div>

            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <CollapsibleTrigger className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring rounded-sm">
                <ChevronDown
                  className={`h-4 w-4 transition-transform motion-reduce:transition-none ${advancedOpen ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
                When messages fail
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-2">{FAILURE_FIELDS.map(renderField)}</div>
              </CollapsibleContent>
            </Collapsible>

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" disabled={!dirty || saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />}
              Save sending pace
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
