export const formatPrice = (value) => {
    if (value === null || value === undefined || isNaN(value)) {
        return 'N/A';
    }
    return `$${value.toFixed(2)}`;
};

export const formatPercentage = (value) => {
    if (value === null || value === undefined || isNaN(value)) {
        return 'N/A';
    }
    // If value is already 0-100, don't multiply by 100
    // If value is 0-1, multiply by 100
    const percentage = value > 1 ? value : value * 100;
    return `${percentage.toFixed(1)}%`;
};

export const formatNumber = (value) => {
    if (value === null || value === undefined) {
        return 'N/A';
    }
    if (value >= 1000000000) {
        return (value / 1000000000).toFixed(1) + 'B';
    }
    if (value >= 1000000) {
        return (value / 1000000).toFixed(1) + 'M';
    }
    if (value >= 1000) {
        return (value / 1000).toFixed(1) + 'K';
    }
    return value.toLocaleString();
};

export const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString);
        return new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        }).format(date);
    } catch (error) {
        return 'Invalid Date';
    }
};

export const formatDuration = (milliseconds) => {
    if (milliseconds === null || milliseconds === undefined) {
        return 'N/A';
    }

    if (milliseconds < 1000) {
        return `${milliseconds.toFixed(0)}ms`;
    }

    const seconds = milliseconds / 1000;
    if (seconds < 60) {
        return `${seconds.toFixed(2)}s`;
    }

    const minutes = seconds / 60;
    if (minutes < 60) {
        return `${minutes.toFixed(2)}m`;
    }

    const hours = minutes / 60;
    return `${hours.toFixed(2)}h`;
};
