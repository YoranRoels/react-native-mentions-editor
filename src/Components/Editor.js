import React from "react";
import PropTypes from "prop-types";
import { Platform, StyleSheet, Text, TextInput, View } from "react-native";

// - Project imports -
// Components
import MentionList from "./MentionList";
// Styling
import * as Colors from "./../Constants/Colors";
// Utils
import EU from "../Utils/EditorUtils";

export class Editor extends React.Component {
  static propTypes = {
    list: PropTypes.array,
    initialValue: PropTypes.string,
    clearInput: PropTypes.any,
    onChange: PropTypes.func,
    onChangeKeyword: PropTypes.func,
    showEditor: PropTypes.bool,
    toggleEditor: PropTypes.func,
    showMentions: PropTypes.bool,
    onHideMentions: PropTypes.func,
    customStyles: PropTypes.object,
    placeholder: PropTypes.string,

    fetchingMentions: PropTypes.bool,
    horizontal: PropTypes.bool,
    renderLeftView: PropTypes.func,
    renderMention: PropTypes.func,
    renderMentionList: PropTypes.func,
    renderRightView: PropTypes.func,
    trigger: PropTypes.string, // '@', '#', ...
    triggerLocation: PropTypes.string, // 'new-words-only', 'anywhere'
  };

  static defaultProps = {
    renderLeftView: () => {
      return null;
    },
    renderRightView: () => {
      return null;
    },
    renderMentionList: () => {},
    customStyles: {},
    onChangeKeyword: () => {},
    fetchingMentions: false,
    showEditor: true,
    placeholder: "Type something, @mentions",
    trigger: "@",
    triggerLocation: "anywhere",
  };

  constructor(props) {
    super(props);

    this.mentionsMap = new Map();
    let msg = "";
    let formattedMsg = "";

    if (props.initialValue && props.initialValue !== "") {
      const { map, newValue } = EU.getMentionsWithInputText(props.initialValue);
      this.mentionsMap = map;
      msg = newValue;
      formattedMsg = this.formatText(newValue);
      setTimeout(() => {
        this.sendMessageToFooter(newValue);
      });
    }

    this.state = {
      inputText: msg,
      formattedText: formattedMsg,
      keyword: "",
      isTrackingStarted: false,
      selection: undefined,
      showMentions: false,
    };

    this.isTrackingStarted = false;
    this.previousChar = " ";
    this.selection = { end: 0, start: 0 };
  }
  static getDerivedStateFromProps(nextProps, prevState) {
    if (nextProps.showMentions && !prevState.showMentions) {
      const newInputText = `${prevState.inputText}${nextProps.trigger}`;
      return {
        inputText: newInputText,
        showMentions: nextProps.showMentions,
      };
    }

    if (!nextProps.showMentions) {
      return {
        showMentions: nextProps.showMentions,
      };
    }
    return null;
  }

  componentDidUpdate(prevProps, prevState) {
    // Clear input when passing different 'clearInput' value.
    if (
      this.state.inputText !== "" &&
      prevProps.clearInput !== this.props.clearInput
    ) {
      this.setState({
        inputText: "",
        formattedText: "",
      });
      this.mentionsMap.clear();
      this.props.onChange({
        displayText: "",
        text: "",
      });
    }

    if (EU.whenTrue(this.props, prevProps, "showMentions")) {
      //don't need to close on false; user show select it.
      this.onChange(this.state.inputText, true);
    }
  }

  updateMentionsMap(selection, count, shouldAdd) {
    this.mentionsMap = EU.updateRemainingMentionsIndexes(
      this.mentionsMap,
      selection,
      count,
      shouldAdd,
    );
  }

  startTracking(menIndex) {
    this.isTrackingStarted = true;
    this.menIndex = menIndex;
    this.setState({
      keyword: "",
      isTrackingStarted: true,
    });
  }

  stopTracking() {
    this.isTrackingStarted = false;
    // this.closeSuggestionsPanel();
    this.setState({
      isTrackingStarted: false,
    });
    this.props.onHideMentions();
  }

  resetTextbox() {
    this.previousChar = " ";
    this.stopTracking();
  }

  identifyKeyword(inputText) {
    /**
     * filter the mentions list
     * according to what user type with
     * @ char e.g. @billroy
     */
    if (this.isTrackingStarted) {
      let pattern = null;
      if (this.props.triggerLocation === "new-words-only") {
        pattern = new RegExp(
          `\\B${this.props.trigger}[a-z0-9_-]+|\\B${this.props.trigger}`,
          `gi`,
        );
      } else {
        //anywhere
        pattern = new RegExp(
          `\\${this.props.trigger}[a-z0-9_-]+|\\${this.props.trigger}`,
          `i`,
        );
      }
      const str = inputText.substr(this.menIndex);
      const keywordArray = str.match(pattern);
      if (keywordArray && !!keywordArray.length) {
        const lastKeyword = keywordArray[keywordArray.length - 1];
        this.props.onChangeKeyword(lastKeyword);
        this.setState({
          keyword: lastKeyword,
        });
      }
    }
  }

  checkForMention(inputText, selection) {
    /**
     * Open mentions list if user starts typing @.
     */
    const menIndex = selection.start - 1;
    const lastChar = inputText.substr(menIndex, 1);
    const wordBoundary =
      this.props.triggerLocation === "new-words-only"
        ? this.previousChar.trim().length === 0
        : true;
    if (lastChar === this.props.trigger && wordBoundary) {
      this.startTracking(menIndex);
    } else if (lastChar.trim() === "" && this.state.isTrackingStarted) {
      this.stopTracking();
    }
    this.previousChar = lastChar;
    this.identifyKeyword(inputText);
  }

  getInitialAndRemainingStrings(inputText, menIndex) {
    /**
     * getInitialAndRemainingStrings
     * this function extract the initialStr and remainingStr
     * at the point of new Mention string.
     * Also updates the remaining string if there
     * are any adjacent mentions text with the new one.
     */
    let initialStr = inputText.substr(0, menIndex).trim();
    if (!EU.isEmpty(initialStr)) {
      initialStr = initialStr + " ";
    }
    /**
     * remove the characters adjacent with @ sign
     * and extract the remaining part
     */
    let remStr =
      inputText
        .substr(menIndex + 1)
        .replace(/\s+/, "\x01")
        .split("\x01")[1] || "";

    /**
     * check if there are any adjacent mentions
     * subtracted in current selection.
     * add the adjacent mentions
     * @tim@nic
     * add nic back
     */
    const adjMentIndexes = {
      start: initialStr.length - 1,
      end: inputText.length - remStr.length - 1,
    };
    const mentionKeys = EU.getSelectedMentionKeys(
      this.mentionsMap,
      adjMentIndexes,
    );
    mentionKeys.forEach(key => {
      remStr = `@${this.mentionsMap.get(key).name} ${remStr}`;
    });
    return {
      initialStr,
      remStr,
    };
  }

  onSuggestionTap = user => {
    /**
     * When user taps a mention, add it to string and mention map.
     */
    const { inputText } = this.state;
    const { initialStr, remStr } = this.getInitialAndRemainingStrings(
      inputText,
      this.menIndex,
    );

    const name = `@${user.name}`;
    const text = `${initialStr}${name} ${remStr}`;
    //'@[__display__](__id__)' ///find this trigger parsing from react-mentions

    //set the mentions in the map.
    const menStartIndex = initialStr.length;
    const menEndIndex = menStartIndex + (name.length - 1);

    this.mentionsMap.set([menStartIndex, menEndIndex], user);

    // update remaining mentions indexes
    let charAdded = Math.abs(text.length - inputText.length);
    this.updateMentionsMap(
      {
        start: menEndIndex + 1,
        end: text.length,
      },
      charAdded,
      true,
    );

    this.setState({
      inputText: text,
      formattedText: this.formatText(text),
    });
    this.stopTracking();
    this.sendMessageToFooter(text);
  };

  handleSelectionChange = ({ nativeEvent: { selection } }) => {
    const prevSelection = this.selection;
    let newSelection = selection;
    if (
      selection.start !== selection.end &&
      (selection.start !== prevSelection.start ||
        selection.end !== prevSelection.end)
    ) {
      // If selection changes automatically add or remove mentions to selection.
      newSelection = EU.addMenInSelection(
        newSelection,
        prevSelection,
        this.mentionsMap,
      );
    }
    this.selection = { ...newSelection };

    this.setState({ selection: newSelection });
  };

  formatMentionNode = (txt, key) => (
    <Text key={key} style={styles.mention}>
      {txt}
    </Text>
  );

  formatText(inputText) {
    /**
     * Format the Mentions and display them with the different styles.
     */
    if (inputText === "" || !this.mentionsMap.size) return inputText;
    const formattedText = [];
    let lastIndex = 0;
    this.mentionsMap.forEach((men, [start, end]) => {
      const initialStr =
        start === 1 ? "" : inputText.substring(lastIndex, start);
      lastIndex = end + 1;
      formattedText.push(initialStr);
      const formattedMention = this.formatMentionNode(
        `@${men.name}`,
        `${start}-${men.id}-${end}`,
      );
      formattedText.push(formattedMention);
      if (
        EU.isKeysAreSame(EU.getLastKeyInMap(this.mentionsMap), [start, end])
      ) {
        const lastStr = inputText.substr(lastIndex); //remaining string
        formattedText.push(lastStr);
      }
    });
    return formattedText;
  }

  formatTextWithMentions(inputText) {
    if (inputText === "" || !this.mentionsMap.size) return inputText;
    let formattedText = "";
    let lastIndex = 0;
    this.mentionsMap.forEach((men, [start, end]) => {
      const initialStr =
        start === 1 ? "" : inputText.substring(lastIndex, start);
      lastIndex = end + 1;
      formattedText = formattedText.concat(initialStr);
      formattedText = formattedText.concat(`@[${men.name}](id:${men.id})`);
      if (
        EU.isKeysAreSame(EU.getLastKeyInMap(this.mentionsMap), [start, end])
      ) {
        const lastStr = inputText.substr(lastIndex); //remaining string
        formattedText = formattedText.concat(lastStr);
      }
    });
    return formattedText;
  }

  sendMessageToFooter(text) {
    this.props.onChange({
      displayText: text,
      text: this.formatTextWithMentions(text),
    });
  }

  onChange = (inputText, fromAtBtn) => {
    let text = inputText;
    const prevText = this.state.inputText;
    let selection = this.selection;
    // FIXME: Workaround for inconsistent event firing (iOS/Android) causing a selection delay for Android (https://github.com/facebook/react-native/issues/18221).
    if (Platform.OS === "android") {
      selection =
        inputText.length > prevText.length
          ? { start: selection.start + 1, end: selection.end + 1 }
          : { start: selection.start - 1, end: selection.end - 1 };
    }

    if (fromAtBtn) {
      // Update selection but don't set in state it will be auto set by input.
      selection.start = selection.start + 1;
      selection.end = selection.end + 1;
    }
    if (text.length < prevText.length) {
      /**
       * If user is back pressing and it deletes the mention remove it from string.
       */
      let charDeleted = Math.abs(text.length - prevText.length);
      const totalSelection = {
        start: selection.start,
        end: charDeleted > 1 ? selection.start + charDeleted : selection.start,
      };
      /**
       * Remove all the selected mentions
       */
      if (totalSelection.start === totalSelection.end) {
        // Single char deleting.
        const key = EU.findMentionKeyInMap(
          this.mentionsMap,
          totalSelection.start,
        );
        if (key && key.length) {
          this.mentionsMap.delete(key);
          /**
           * don't need to worry about multi-char selection
           * because our selection automatically select the
           * whole mention string.
           */
          const initial = text.substring(0, key[0]); //mention start index
          text = initial + text.substr(key[1]); // mentions end index
          charDeleted = charDeleted + Math.abs(key[0] - key[1]); //1 is already added in the charDeleted
          // selection = {
          //     start: ((charDeleted+selection.start)-1),
          //     end: ((charDeleted+selection.start)-1)
          // }
          this.mentionsMap.delete(key);
        }
      } else {
        // Multi-char delete.
        const mentionKeys = EU.getSelectedMentionKeys(
          this.mentionsMap,
          totalSelection,
        );
        mentionKeys.forEach(key => {
          this.mentionsMap.delete(key);
        });
      }
      /**
       * Update indexes on char remove no need to worry about totalSelection End.
       * We already removed deleted mentions from the actual string.
       */
      this.updateMentionsMap(
        {
          start: selection.end,
          end: prevText.length,
        },
        charDeleted,
        false,
      );
    } else {
      //update indexes on new character add

      let charAdded = Math.abs(text.length - prevText.length);
      this.updateMentionsMap(
        {
          start: selection.end,
          end: text.length,
        },
        charAdded,
        true,
      );
      /**
       * if user type anything on the mention
       * remove the mention from the mentions array
       * */
      if (selection.start === selection.end) {
        const key = EU.findMentionKeyInMap(
          this.mentionsMap,
          selection.start - 1,
        );
        if (key && key.length) {
          this.mentionsMap.delete(key);
        }
      }
    }

    this.setState({
      inputText: text,
      formattedText: this.formatText(text),
    });
    this.checkForMention(text, selection);

    this.sendMessageToFooter(text);
  };

  shouldMentionsShow = (state, props) => {
    // length > 1 is used to ignore the trigger symbol.
    // The 'fetchingMentions || list.length > 0' is used to only show mentions when there is content to avoid showing borders on empty content.
    return (
      state.isTrackingStarted &&
      state.keyword.length > 1 &&
      (props.fetchingMentions || props.list.length > 0)
    );
  };

  render() {
    const { props, state } = this;
    const { customStyles, fetchingMentions, list } = props;

    if (!props.showEditor) return null;

    const baseInputProps = {
      ref: input => props.onRef && props.onRef(input),
      style: [styles.input, customStyles.input],
      multiline: true,
      value: state.inputText,
      onBlur: props.toggleEditor,
      onChangeText: this.onChange,
      onSelectionChange: this.handleSelectionChange,
    };

    const mentionListProps = {
      customStyles,
      fetching: fetchingMentions,
      horizontal: props.horizontal,
      keyword: state.keyword,
      list: list,
      onSuggestionTap: this.onSuggestionTap,
      renderMention: props.renderMention,
      show: this.shouldMentionsShow(state, props),
    };

    return (
      <View style={customStyles.container}>
        {this.shouldMentionsShow(state, props) ? (
          <MentionList {...mentionListProps} />
        ) : (
          props.renderMentionList(mentionListProps)
        )}
        <View style={[styles.inputRow, customStyles.inputRow]}>
          {this.props.renderLeftView()}
          <View style={customStyles.inputContainer}>
            <View
            // Extra view here to put input & its mask on same spacing!
            >
              <View style={styles.formattedTextWrapper}>
                <Text
                  style={[styles.formattedText, customStyles.inputMaskText]}
                >
                  {state.formattedText}
                </Text>
              </View>
              {Platform.OS === "ios" ? (
                <TextInput
                  {...this.props}
                  {...baseInputProps}
                  scrollEnabled={false}
                  // FIXME: As of updating to React-Native 0.63.3, selection is broken on iOS too (https://github.com/facebook/react-native/issues/29063).
                  // selection={this.state.selection}
                />
              ) : (
                <TextInput
                  {...this.props}
                  {...baseInputProps}
                  // FIXME: Add support for 'selection' on Android (quickly selecting & deselection mention when selecting more or less).
                />
              )}
            </View>
          </View>
          {this.props.renderRightView()}
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  inputRow: {
    flexDirection: "row",
  },
  input: {
    color: "transparent",
    // Android fixes
    padding: 0,
    margin: 0,
    // Padding to look decent with multiple lines
    paddingTop: 4,
    paddingBottom: 4,
  },
  formattedTextWrapper: {
    justifyContent: "center",
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    paddingVertical: 4,
  },
  formattedText: {
    color: Colors.MATERIAL_PRIMARY_TEXT,
  },
  mention: {
    backgroundColor: Colors.MENTION_BACKGROUND,
    color: Colors.MENTION_TEXT,
  },
});

export default Editor;
