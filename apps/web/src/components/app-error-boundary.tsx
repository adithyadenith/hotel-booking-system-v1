"use client"

import { Component, type ErrorInfo, type ReactNode } from "react"
import { PageError } from "./page-state"

type Props = { children: ReactNode }
type State = { error: Error | null }

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null }
  static getDerivedStateFromError(error: Error): State { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("Page error", error, info) }
  render() {
    if (this.state.error) return <PageError title="Something went wrong" message="The page had an unexpected problem. Your saved hotel data is safe." onRetry={() => { this.setState({ error: null }); window.location.reload() }} />
    return this.props.children
  }
}
