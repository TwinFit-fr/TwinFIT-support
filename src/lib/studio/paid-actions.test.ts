import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MESHY_AVATAR, MESHY_EQUIPMENT, avatarBuildRequest, balanceCheck, costText, durationText, equipmentBuildRequest, generationRequest, shortEstimate } from "./paid-actions.ts";

describe("cost and time of paid actions", () => {
  it("uses only the Studio's own estimates and says when there is none", () => {
    assert.equal(costText(MESHY_AVATAR), "About 35 Meshy credits");
    assert.equal(costText(MESHY_EQUIPMENT, 14), "About 30 credits each, about 420 in total");
    assert.equal(costText({ credits: null, duration: null }), "Charged by Meshy per request; the Studio has no estimate");
    assert.equal(durationText(MESHY_AVATAR), "3 to 5 minutes");
    assert.equal(durationText(MESHY_EQUIPMENT), "No estimate in the Studio; Meshy reports progress as it goes");
    assert.equal(shortEstimate(MESHY_AVATAR), "35 cr · 3–5 min");
    assert.equal(shortEstimate(MESHY_EQUIPMENT), "30 cr");
  });

  it("describes an avatar build, a first one and a retry", () => {
    const first = avatarBuildRequest({ name: "TwinFIT woman", subject: "woman" });
    assert.equal(first.title, "Build TwinFIT woman with Meshy?");
    assert.equal(first.credits, 35);
    assert.equal(first.confirmLabel, "Start build · 35 credits");
    assert.match(first.action, /stays on the stage/);
    const retry = avatarBuildRequest({ name: "TwinFIT woman", subject: "woman", retry: true });
    assert.equal(retry.source, "The same reference image as before");
  });

  it("adds up a bulk equipment build and names the first implements", () => {
    const req = equipmentBuildRequest({ names: ["Band", "Dip Belt", "Landmine", "Plate", "Bicycle", "Rower"] });
    assert.equal(req.title, "Generate 6 missing models with Meshy?");
    assert.equal(req.subject, "6 implements: Band, Dip Belt, Landmine, Plate and 2 more");
    assert.equal(req.credits, 180);
    assert.equal(req.confirmLabel, "Generate · about 180 credits");
    const one = equipmentBuildRequest({ names: ["Barbell"], customImage: "bar.png", replacesReady: true });
    assert.equal(one.source, "Your image bar.png");
    assert.match(one.action, /model in use stays/);
  });

  it("describes an AI movement without inventing a price", () => {
    const req = generationRequest({ exercise: "Air Squat", avatar: "Mannequin" });
    assert.equal(req.provider, "OpenAI");
    assert.equal(req.title, "Generate a movement for Air Squat?");
    assert.equal(req.subject, "Air Squat on Mannequin");
    assert.equal(req.source, "OpenAI gpt-5-mini (the default)");
    assert.equal(req.cost, "Charged by OpenAI per request; the Studio has no estimate");
    assert.equal(req.credits, null);
    assert.match(req.duration, /^About ten seconds/);
    assert.match(req.duration, /30 s later/);
    assert.equal(req.confirmLabel, "Generate");
    const retry = generationRequest({ exercise: "Push-Up", avatar: "Mannequin", model: "gpt-5", retry: true, seq: 212 });
    assert.equal(retry.title, "Generate Push-Up #212 again?");
    assert.equal(retry.source, "OpenAI gpt-5");
    assert.equal(retry.confirmLabel, "Put back in the queue");
    assert.equal(avatarBuildRequest({ name: "A", subject: "man" }).provider, "Meshy");
  });

  it("checks the balance against the estimate", () => {
    assert.deepEqual(balanceCheck(2910, 35), { text: "2910 credits left", enough: true });
    assert.deepEqual(balanceCheck(20, 35), { text: "20 credits left, about 35 needed", enough: false });
    assert.deepEqual(balanceCheck(null, 35), { text: "Not known right now", enough: null });
  });
});
