import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './ui/primitives.tsx';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Une erreur inattendue est survenue.',
    };
  }

  componentDidCatch(error: Error): void {
    console.error('DataMind UI ErrorBoundary:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-8 text-center">
            <div className="mx-auto w-11 h-11 rounded-lg bg-red-50 text-red-600 flex items-center justify-center mb-4">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h1 className="text-lg font-semibold text-[#0F172A]">Erreur d’affichage</h1>
            <p className="text-sm text-slate-600 mt-2">{this.state.message}</p>
            <Button
              className="mt-6"
              onClick={() => {
                this.setState({ hasError: false, message: '' });
                window.location.reload();
              }}
            >
              Recharger l’application
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
