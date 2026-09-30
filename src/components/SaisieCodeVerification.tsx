"use client";

import { OTPInput, REGEXP_ONLY_DIGITS, type SlotProps } from "input-otp";

function Case({ slot }: { slot: SlotProps }) {
  return (
    <div
      className={`relative flex h-12 w-10 min-w-0 shrink items-center justify-center rounded-lg border text-lg font-semibold text-zinc-900 ${
        slot.isActive
          ? "border-[#1E3A8A] ring-2 ring-[#1E3A8A]/30"
          : "border-zinc-300"
      }`}
    >
      {slot.char}
      {slot.hasFakeCaret && (
        <div className="absolute h-5 w-px animate-pulse bg-zinc-900" />
      )}
    </div>
  );
}

interface SaisieCodeVerificationProps {
  valeur: string;
  onChange: (valeur: string) => void;
  onComplete?: (valeur: string) => void;
  desactive?: boolean;
}

/** Code de vérification à 6 chiffres, saisi case par case (collage géré automatiquement). */
export function SaisieCodeVerification({
  valeur,
  onChange,
  onComplete,
  desactive,
}: SaisieCodeVerificationProps) {
  return (
    <OTPInput
      value={valeur}
      onChange={onChange}
      onComplete={onComplete}
      maxLength={6}
      pattern={REGEXP_ONLY_DIGITS}
      disabled={desactive}
      inputMode="numeric"
      containerClassName="flex w-full items-center justify-center gap-2"
      render={({ slots }) => (
        <>
          <div className="flex min-w-0 shrink gap-1.5 sm:gap-2">
            {slots.slice(0, 3).map((slot, index) => (
              <Case key={index} slot={slot} />
            ))}
          </div>
          <div
            className="h-0.5 w-2 shrink-0 rounded-full bg-zinc-400"
            aria-hidden="true"
          />
          <div className="flex min-w-0 shrink gap-1.5 sm:gap-2">
            {slots.slice(3).map((slot, index) => (
              <Case key={index + 3} slot={slot} />
            ))}
          </div>
        </>
      )}
    />
  );
}
