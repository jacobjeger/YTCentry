"use client";

import { useEffect, useState } from "react";
import ReviewCard, { type ReviewItem } from "./ReviewCard";
import { listGroups } from "../enroll/actions";

export default function ReviewList({ items }: { items: ReviewItem[] }) {
  const [groups, setGroups] = useState<string[]>([]);
  useEffect(() => {
    listGroups().then(setGroups);
  }, []);
  return (
    <div className="flex flex-col gap-5">
      {items.map((item) => (
        <ReviewCard key={item.id} item={item} groups={groups} />
      ))}
    </div>
  );
}
