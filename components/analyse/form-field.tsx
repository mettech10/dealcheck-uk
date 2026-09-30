"use client"

import { createContext, useContext, useId, type ComponentProps, type ReactNode } from "react"
import { Input as BaseInput } from "@/components/ui/input"
import { SelectTrigger as BaseSelectTrigger } from "@/components/ui/select"
import { Label } from "@/components/ui/label"

const FieldContext = createContext<{ label: string; description?: string; invalid: boolean } | null>(null)

export function FormField({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  const id = useId()
  const description = error || hint
  return (
    <FieldContext.Provider value={{ label: `${id}-label`, description: description ? `${id}-description` : undefined, invalid: !!error }}>
      <div className="flex flex-col gap-1.5">
        <Label id={`${id}-label`} className="text-sm text-foreground">{label}</Label>
        {children}
        {description && <span id={`${id}-description`} className={`text-xs ${error ? "text-destructive" : "text-muted-foreground"}`}>{description}</span>}
      </div>
    </FieldContext.Provider>
  )
}

export function FieldInput(props: ComponentProps<typeof BaseInput>) {
  const field = useContext(FieldContext)
  return <BaseInput aria-labelledby={field?.label} aria-describedby={field?.description} aria-invalid={field?.invalid || undefined} {...props} />
}

export function FieldSelectTrigger(props: ComponentProps<typeof BaseSelectTrigger>) {
  const field = useContext(FieldContext)
  return <BaseSelectTrigger aria-labelledby={field?.label} aria-describedby={field?.description} aria-invalid={field?.invalid || undefined} {...props} />
}
