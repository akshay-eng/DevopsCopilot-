import React from 'react';

export const FormattedTokenDisplay = ({ value }) => {
    if (value === null || value === undefined) {
        return <span>N/A</span>;
    }

    const formatNumber = (num) => {
        if (num >= 1000000000) {
            return (num / 1000000000).toFixed(1) + 'B';
        }
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        }
        if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toLocaleString();
    };

    return <span>{formatNumber(value)}</span>;
};
