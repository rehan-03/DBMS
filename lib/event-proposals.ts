export function normalizeEventProposal(proposal: any) {
  return {
    ...proposal,
    organizer_id: proposal.organizer_id || proposal.submitted_by || proposal.created_by,
    status: String(proposal.status || "pending").trim().toLowerCase(),
  };
}

export function prepareEventProposal(payload: any) {
  for (const field of ["title", "description", "venue", "event_type"]) {
    if (typeof payload?.[field] !== "string" || !payload[field].trim()) {
      throw new Error("Please enter the event title, type, description, and venue.");
    }
  }
  const start = new Date(payload.start_date);
  const end = new Date(payload.end_date);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    throw new Error("Please select valid start and end dates.");
  }
  if (end <= start) throw new Error("The event end must be after its start.");
  const footfall = Number(payload.expected_footfall);
  const budget = Number(payload.estimated_budget || 0);
  if (!Number.isInteger(footfall) || footfall <= 0) {
    throw new Error("Expected footfall must be a positive whole number.");
  }
  if (!Number.isFinite(budget) || budget < 0) {
    throw new Error("Estimated budget must be zero or more.");
  }
  return {
    ...payload,
    title: payload.title.trim(),
    description: payload.description.trim(),
    venue: payload.venue.trim(),
    start_date: start.toISOString(),
    end_date: end.toISOString(),
    expected_footfall: footfall,
    estimated_budget: budget,
  };
}
