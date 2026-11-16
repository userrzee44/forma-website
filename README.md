# Forma — Creative Studio

A responsive editorial portfolio template built with HTML, CSS, and JavaScript. No package installation, build step, or environment variables required.

## Vercel

Import the GitHub repository into Vercel. Keep the Root Directory at the repository root. The included `vercel.json` configures this as a static site with no build command and output directory `.`.

## Local preview

Run `python3 -m http.server 3000` in this directory, then visit http://localhost:3000.

## Customize

- `index.html`: studio name, copy, project descriptions, metadata, and contact section.
- `style.css`: colors, fonts, layout, and CSS project illustrations.
- `script.js`: project category filtering and enquiry draft download.
- `favicon.svg`: browser tab icon.

All projects and the studio identity are illustrative concept content. Replace them with your own work before presenting the website as a real business. Project cards lead to the enquiry section. The enquiry form creates a local text file; it does not send email or store submissions. To receive real enquiries, connect your chosen form service and update the form's explanatory copy.

Google Fonts supplies optional typography. The site uses system font fallbacks if unavailable. All artwork is CSS, so there are no external image dependencies.
