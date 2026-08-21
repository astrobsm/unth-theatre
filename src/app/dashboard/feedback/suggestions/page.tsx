import FeedbackReview from '../review/FeedbackReview';

// What the theatre users have asked to have changed, including everything sent
// through the public service-improvement link at /improve. Its own address and
// its own sidebar entry, because it is read by different people, for different
// reasons, than the patient survey.
export default function TheatreUserSuggestionsPage() {
  return <FeedbackReview kind="staff" />;
}
