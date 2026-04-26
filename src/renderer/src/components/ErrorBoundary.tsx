import { Component, ReactNode } from 'react'

interface Props {
  label?: string
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error(
      `[ErrorBoundary${this.props.label ? ` · ${this.props.label}` : ''}]`,
      error,
      info
    )
  }

  reset = () => this.setState({ error: null })

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-card border border-danger/30 bg-danger/5 p-4 space-y-2">
          <div className="text-sm font-semibold text-danger">
            {this.props.label ?? 'Component'} crashed
          </div>
          <div className="font-mono text-xs text-fg-muted break-all">
            {this.state.error.message}
          </div>
          <button
            onClick={this.reset}
            className="text-xs text-accent hover:underline"
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
