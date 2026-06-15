import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/explore', '/free-tools', '/login', '/privacy', '/terms', '/contact'],
        disallow: ['/admin', '/stats', '/import', '/onboarding', '/apply-profile', '/api/'],
      },
    ],
    sitemap: 'https://hyred.in/sitemap.xml',
  };
}
