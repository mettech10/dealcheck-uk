"use client"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CATEGORY_KIND_ORDER, categoriesByKind, kindLabel } from "@/lib/mtd/categories"

export function CategoryPicker({
  value,
  onChange,
  id,
}: {
  value: string
  onChange: (code: string) => void
  id?: string
}) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full min-w-0">
        <SelectValue placeholder="SA105 category" />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {CATEGORY_KIND_ORDER.map((kind) => (
          <SelectGroup key={kind}>
            <SelectLabel>{kindLabel(kind)}</SelectLabel>
            {categoriesByKind(kind).map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.sa105Box ? `Box ${c.sa105Box} · ${c.name}` : c.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}
