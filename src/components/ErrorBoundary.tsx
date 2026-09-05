import { Component, type ErrorInfo, type ReactNode } from 'react';
import { exportRawState, restoreLastGoodBackup } from '../state/storage';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  restored: boolean;
}

// Top-level crash catcher. A bug anywhere in the render tree (a bad input, an
// edge case in the projection solvers) would otherwise blank the whole app
// with no way back — this keeps the user's data reachable and offers a way
// out instead of a white screen.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, restored: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Retirement Planner crashed:', error, info.componentStack);
  }

  handleRestore = () => {
    this.setState({ restored: restoreLastGoodBackup() });
  };

  render() {
    const { error, restored } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="crash-screen">
        <h1>Something went wrong</h1>
        <p>
          The app hit an unexpected error and can&rsquo;t continue. Your data is still saved in this browser — it
          isn&rsquo;t lost.
        </p>
        <pre className="crash-detail">{error.message}</pre>
        <div className="crash-actions">
          <button className="btn" onClick={() => exportRawState()}>
            Export saved data
          </button>
          <button className="btn" onClick={() => window.location.reload()}>
            Reload
          </button>
          <button className="btn subtle" onClick={this.handleRestore} disabled={restored}>
            {restored ? 'Restored — reload above' : 'Restore last known-good state'}
          </button>
        </div>
      </div>
    );
  }
}
