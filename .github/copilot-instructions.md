# Operative Resource Manager-ORM - University of Nigeria Teaching Hospital Ituku Ozalla

## Project Overview
Comprehensive operative resource management system for surgical operations, inventory, scheduling, and patient tracking.

## Key Features
- Role-based authentication (theatre manager, theatre chairman, admin, surgeon, scrub nurses)
- Inventory management with cost tracking
- Surgery scheduling with detailed patient forms
- WHO surgical checklists integration
- Patient transfer tracking
- Case cancellation documentation
- Preoperative fitness assessment

## Technology Stack
- Frontend: Next.js 14, React, TypeScript, Tailwind CSS
- Backend: Next.js API Routes, Express.js
- Database: PostgreSQL (theatre_db)
- Authentication: NextAuth.js with role-based access control
- ORM: Prisma

## Database Configuration
- Username: postgres
- Password: natiss_natiss
- Database: theatre_db

## Development Guidelines
- Use TypeScript for type safety
- Follow React/Next.js best practices
- Implement proper error handling
- Use server-side rendering where appropriate
- Maintain comprehensive audit logs for all critical operations
