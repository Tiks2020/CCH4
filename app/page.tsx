import type { Metadata } from "next"
import Component from "../homepage"

export const metadata: Metadata = {
  title: "Cincinnati Children's Hospital",
  description: "Digital human video call application for administering PHQ-9 questionnaire sessions",
}

export default function Page() {
  return <Component />
}
