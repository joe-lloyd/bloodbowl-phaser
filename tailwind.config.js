/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                'bb': {
                    // Primary Colors
                    'blood-red': '#8E1B1B',
                    'deep-crimson': '#B32020',
                    'ink-blue': '#1E3A5F',

                    // Secondary Colors
                    'parchment': '#F3E9D2',
                    'warm-paper': '#E8DDC4',

                    // Accent Colors
                    'gold': '#D6B25E',
                    'dark-gold': '#B59645',
                    'pitch-green': '#556B2F',

                    // Utility Colors
                    'text-dark': '#2A1F1A',
                    'muted-text': '#6B5E54',
                    'divider': '#C7B89A',
                    'error': '#9C1C1C',
                    'success': '#3E6B2F',
                },
            },
            fontFamily: {
                'heading': ['Oswald', 'sans-serif'],
                'body': ['Crimson Pro', 'Georgia', 'serif'],
            },
            spacing: {
                'xs': '8px',
                'sm': '16px',
                'md': '24px',
                'lg': '32px',
                'xl': '48px',
                'xxl': '64px',
            },
            boxShadow: {
                'parchment': '2px 3px 20px rgba(0,0,0,0.3), 0 0 60px rgba(138,77,15,0.15) inset',
                'parchment-light': '1px 1.5px 10px rgba(0,0,0,0.2), 0 0 30px rgba(138,77,15,0.1) inset',
                'chunky': '0 4px 0 rgba(0,0,0,0.2)',
            },
            transitionTimingFunction: {
                'bb': 'cubic-bezier(0.2, 0.8, 0.2, 1)',
            },
        },
    },
    plugins: [],
}
