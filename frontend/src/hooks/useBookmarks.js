import { useState, useCallback, useEffect } from 'react';

const BOOKMARKS_STORAGE_KEY = 'agentops_bookmarks';

export const useBookmarks = () => {
    const [bookmarks, setBookmarks] = useState(() => {
        try {
            const stored = localStorage.getItem(BOOKMARKS_STORAGE_KEY);
            return stored ? new Set(JSON.parse(stored)) : new Set();
        } catch (error) {
            console.error('Error loading bookmarks:', error);
            return new Set();
        }
    });

    useEffect(() => {
        try {
            localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(Array.from(bookmarks)));
        } catch (error) {
            console.error('Error saving bookmarks:', error);
        }
    }, [bookmarks]);

    const isBookmarked = useCallback(
        (traceId) => {
            return bookmarks.has(traceId);
        },
        [bookmarks]
    );

    const toggleBookmark = useCallback((traceId) => {
        setBookmarks((prev) => {
            const newBookmarks = new Set(prev);
            if (newBookmarks.has(traceId)) {
                newBookmarks.delete(traceId);
            } else {
                newBookmarks.add(traceId);
            }
            return newBookmarks;
        });
    }, []);

    const clearBookmarks = useCallback(() => {
        setBookmarks(new Set());
    }, []);

    return {
        bookmarks,
        isBookmarked,
        toggleBookmark,
        clearBookmarks,
    };
};
