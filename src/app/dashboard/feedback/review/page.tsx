import FeedbackReview from './FeedbackReview';

// Patient experience. Kept at its existing address so bookmarks and the
// sidebar entry that has always pointed here still land somewhere sensible.
export default function PatientFeedbackPage() {
  return <FeedbackReview kind="patient" />;
}
