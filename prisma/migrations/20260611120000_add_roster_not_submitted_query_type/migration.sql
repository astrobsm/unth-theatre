-- ============================================================================
-- Migration: Add ROSTER_NOT_SUBMITTED disciplinary query type
--            Supports automatic management queries for units that fail to
--            upload their weekly duty roster by the Saturday 4:00 PM deadline.
-- Author    : Theatre Manager team
-- Date      : 2026-06-11
-- ============================================================================

ALTER TYPE "DisciplinaryQueryType" ADD VALUE IF NOT EXISTS 'ROSTER_NOT_SUBMITTED';
