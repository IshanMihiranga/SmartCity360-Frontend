const COMPLAINTS_API_URL = "http://localhost:8080/SmartCity360/api/complaint";

const form = document.getElementById("complaintForm");
const topicSelect = document.getElementById("topicId");
const descriptionInput = document.getElementById("description");
const nicInput = document.getElementById("userNic");
const submitButton = document.getElementById("submitButton");
const buttonLabel = submitButton.querySelector(".button-label");
const feedback = document.getElementById("formFeedback");
const retryButton = document.getElementById("retryTopicsButton");

let topicsReady = false;
let submitting = false;

function setFeedback(message, state = "") {
  feedback.textContent = message;
  feedback.dataset.state = state;
}

function setTopicsEnabled(enabled) {
  topicsReady = enabled;
  topicSelect.disabled = !enabled;
  submitButton.disabled = !topicsReady || submitting;
}

function getTopicList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.content)) return payload.content;
  throw new Error("The complaint topics response was not a list.");
}

function getTopicOption(topic) {
  const rawId = topic?.id ?? topic?.topicId;
  const id = Number(rawId);
  const label = topic?.name ?? topic?.topicName ?? topic?.topic ?? topic?.title ?? topic?.value;

  if (rawId === undefined || rawId === null || rawId === "" || !Number.isSafeInteger(id)) {
    throw new Error("A complaint topic has a missing or invalid ID.");
  }
  if (typeof label !== "string" || !label.trim()) {
    throw new Error(`Complaint topic ${id} has no display name.`);
  }

  return { id, label: label.trim() };
}

async function getResponseError(response) {
  const text = await response.text();
  if (!text.trim()) return `Request failed (HTTP ${response.status}).`;

  try {
    const body = JSON.parse(text);
    const message = body?.message ?? body?.error;
    if (typeof message === "string" && message.trim()) return message.trim();
  } catch {
    return text.trim().slice(0, 300);
  }

  return text.trim().slice(0, 300);
}

async function loadTopics() {
  setTopicsEnabled(false);
  retryButton.hidden = true;
  topicSelect.replaceChildren(new Option("Loading complaint topics…", ""));
  setFeedback("Loading complaint topics…", "loading");

  try {
    const response = await fetch(COMPLAINTS_API_URL, {
      method: "GET",
      headers: { Accept: "application/json" }
    });

    if (!response.ok) {
      throw new Error(await getResponseError(response));
    }

    const payload = await response.json();
    const topics = getTopicList(payload).map(getTopicOption);

    if (topics.length === 0) {
      topicSelect.replaceChildren(new Option("No complaint topics available", ""));
      setFeedback("No complaint topics are available right now. Please try again later.", "error");
      retryButton.hidden = false;
      return;
    }

    const options = [new Option("Select a complaint topic", "")];
    for (const topic of topics) {
      options.push(new Option(topic.label, String(topic.id)));
    }
    topicSelect.replaceChildren(...options);
    setTopicsEnabled(true);
    setFeedback("");
  } catch (error) {
    console.error("Could not load complaint topics:", error);
    topicSelect.replaceChildren(new Option("Could not load complaint topics", ""));
    setFeedback(`Could not load complaint topics. ${error.message}`, "error");
    retryButton.hidden = false;
  }
}

async function submitComplaint(event) {
  event.preventDefault();
  if (submitting || !topicsReady || !form.reportValidity()) return;

  const topicId = Number(topicSelect.value);
  if (!Number.isSafeInteger(topicId)) {
    setFeedback("Select a valid complaint topic before submitting.", "error");
    topicSelect.focus();
    return;
  }

  const complaint = {
    topicId,
    description: descriptionInput.value.trim(),
    userNic: nicInput.value.trim()
  };

  if (!complaint.description || !complaint.userNic) {
    setFeedback("Enter a complaint description and NIC number.", "error");
    return;
  }

  submitting = true;
  setTopicsEnabled(true);
  submitButton.disabled = true;
  submitButton.setAttribute("aria-busy", "true");
  buttonLabel.textContent = "Sending…";
  setFeedback("Sending your complaint…", "loading");

  try {
    const response = await fetch(COMPLAINTS_API_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(complaint)
    });

    if (!response.ok) {
      throw new Error(await getResponseError(response));
    }

    form.reset();
    setFeedback("Your complaint was sent successfully.", "success");
  } catch (error) {
    console.error("Could not submit complaint:", error);
    setFeedback(`Could not send your complaint. ${error.message}`, "error");
  } finally {
    submitting = false;
    submitButton.removeAttribute("aria-busy");
    buttonLabel.textContent = "Send complaint";
    submitButton.disabled = !topicsReady;
  }
}

form.addEventListener("submit", submitComplaint);
retryButton.addEventListener("click", loadTopics);
loadTopics();
