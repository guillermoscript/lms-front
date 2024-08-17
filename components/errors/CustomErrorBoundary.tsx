'use client'
import React, { Component, ReactNode } from 'react'

interface ErrorBoundaryProps {
    fallback?: ReactNode;
    children: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
}

class CustomErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    static defaultProps = {
        fallback: <div>Something went wrong.</div>,
    }

    constructor(props: ErrorBoundaryProps) {
        super(props)
        this.state = { hasError: false }
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        // Update state so the next render will show the fallback UI.
        console.error('Error caught by ErrorBoundary:', error)
        return { hasError: true }
    }

    componentDidCatch(error: Error, info: React.ErrorInfo): void {
        // Log the error to an error reporting service
        this.logErrorToService(error, info)
    }

    logErrorToService(error: Error, info: React.ErrorInfo): void {
        // Replace with your error logging service
        console.error('Logging error to service:', error, info)
    }

    render(): ReactNode {
        if (this.state.hasError) {
            // Render fallback UI
            return this.props.fallback
        }

        // Render children components
        return this.props.children
    }
}

export default CustomErrorBoundary
