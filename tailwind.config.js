/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                'blood-bowl': {
                    'primary': '#1d3860',
                    'primary-dark': '#092540',
                    'danger': '#922d26',
                    'danger-dark': '#701d1a',
                    'gold': '#eaaa02',
                    'light-blue': '#d4e8ff',
                    'parchment': '#fffef0',
                    'parchment-shadow': '#8a4d0f',
                },
            },
            boxShadow: {
                'parchment': '2px 3px 20px black, 0 0 60px #8a4d0f inset',
                'parchment-light': '1px 1.5px 10px black, 0 0 15px #8a4d0f inset',
            },
        },
    },
    plugins: [],
}
