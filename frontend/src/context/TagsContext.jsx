// src/context/TagsContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { getTags, createTag, setTagsForObject } from "../api/tags";

const TagsContext = createContext();
// eslint-disable-next-line react-refresh/only-export-components
export const useTags = () => useContext(TagsContext);

export const TagsProvider = ({ children }) => {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load tags when app starts
  const refreshTags = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getTags();
      setTags(data);
    } catch (err) {
      console.error("Failed to fetch tags", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshTags();
  }, [refreshTags]);

  /** Create tag and return the created object immediately */
  const handleCreateTag = async (name) => {
    try {
      const created = await createTag(name.trim()); // should return { id, name }
      setTags((prev) => [...prev, created]);
      return created;
    } catch (err) {
      console.error("Tag creation failed", err);
      throw err;
    }
  };

  /** Set tags for an object immediately and persist */
  const handleSetTagsForObject = async (objectType, objectId, tagIds) => {
    try {
      // Persist to backend
      await setTagsForObject(objectType, objectId, tagIds);
    } catch (err) {
      console.error("Failed to set tags for object", err);
    }
  };

  /** Remove tag from an object's tag list */
  const handleRemoveTag = async (objectType, objectId, currentTagIds, tagIdToRemove, onChange) => {
    const updated = currentTagIds.filter((id) => id !== tagIdToRemove);
    onChange(updated); // update local state immediately
    await handleSetTagsForObject(objectType, objectId, updated);
  };

  return (
    <TagsContext.Provider
      value={{
        tags,
        loading,
        handleCreateTag,
        handleSetTagsForObject,
        handleRemoveTag,
        refreshTags
      }}
    >
      {children}
    </TagsContext.Provider>
  );
};
