"use client"

import { createContext, useContext } from "react"
import type { FlaskBusiness } from "./types"

const MtdBusinessContext = createContext<FlaskBusiness | null>(null)

export function MtdBusinessProvider({
  business,
  children,
}: {
  business: FlaskBusiness
  children: React.ReactNode
}) {
  return (
    <MtdBusinessContext.Provider value={business}>{children}</MtdBusinessContext.Provider>
  )
}

export function useMtdBusiness(): FlaskBusiness {
  const business = useContext(MtdBusinessContext)
  if (!business) {
    throw new Error("MTD business context is not ready")
  }
  return business
}
