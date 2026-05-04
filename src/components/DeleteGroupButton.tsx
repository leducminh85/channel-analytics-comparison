"use client";

import { Trash2 } from "lucide-react";
import { deleteGroup } from "@/app/actions/groupActions";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ActionMenu from "./ActionMenu";
import ConfirmModal from "./ConfirmModal";

interface DeleteGroupButtonProps {
  groupId: string;
  groupName: string;
  redirectToDashboard?: boolean;
}

export default function DeleteGroupButton({
  groupId,
  groupName,
  redirectToDashboard = false,
}: DeleteGroupButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const router = useRouter();

  const handleConfirmDelete = () => {
    startTransition(async () => {
      try {
        await deleteGroup(groupId);
        setIsConfirmOpen(false);
        if (redirectToDashboard) {
          router.push("/dashboard");
        }
      } catch (error: any) {
        alert(error.message);
        setIsConfirmOpen(false);
      }
    });
  };

  return (
    <>
      <ActionMenu
        items={[
          {
            label: "Xóa nhóm",
            icon: <Trash2 className="h-4 w-4" />,
            onClick: () => setIsConfirmOpen(true),
            variant: "destructive",
          },
        ]}
      />

      <ConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleConfirmDelete}
        isLoading={isPending}
        title="Xóa nhóm so sánh"
        description={`Bạn có chắc chắn muốn xóa nhóm "${groupName}"? Mọi dữ liệu về nhóm này sẽ bị gỡ bỏ vĩnh viễn.`}
        confirmText="Xóa ngay"
      />
    </>
  );
}
