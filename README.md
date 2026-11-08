# Harold A. Guzman Portfolio

## Data-driven pages
- `data/home.json` controls the Home page.
- `data/about.json` controls the About page profile, skills, education, social media and certificates.

Edit the JSON files to update content without changing the page layout. Social links can be entered in each `link` field. Certificate images can be placed in `assets/certificates/` and referenced through the certificate `img` field. Verification URLs are entered through `verification_link`.

Run through XAMPP/Apache or Live Server because the pages load JSON with AJAX.

Resume page content is managed in `data/resume.json`. Edit experience, education, skills, and contact fields there.

## Works page data
Edit `data/work.json` to add or update work cards. Each item supports `icon`, `title`, `sub-header`, `description`, `link`, and `img`. Leave `link` empty to hide the View project button. Leave `img` empty to hide the image area in the details popup.
